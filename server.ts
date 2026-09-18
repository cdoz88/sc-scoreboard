import express from "express";
import { createServer as createViteServer } from "vite";
import session from "express-session";
import axios from "axios";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  
  // Allow iframing from selloutcrowds.com
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://selloutcrowds.com https://www.selloutcrowds.com");
    next();
  });
  
  // Persistent Sync Storage (Ensures mobile app and desktop never lose synced leagues)
  const DATA_DIR = path.join(process.cwd(), 'data');
  const SYNC_FILE = path.join(DATA_DIR, 'synced_leagues.json');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const readSyncData = () => {
    try {
      if (fs.existsSync(SYNC_FILE)) {
        return JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('[Sync API] Could not read sync file:', e);
    }
    return { leagues: [], users: {}, updatedAt: 0 };
  };

  const writeSyncData = (data: any) => {
    try {
      fs.writeFileSync(SYNC_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[Sync API] Could not write sync file:', e);
    }
  };

  app.get('/api/sync/leagues', (req, res) => {
    const { userId } = req.query;
    const syncData = readSyncData();

    if (userId && typeof userId === 'string' && syncData.users?.[userId]) {
      return res.json({ 
        leagues: syncData.users[userId].leagues || [],
        updatedAt: syncData.users[userId].updatedAt || 0
      });
    }

    // Default to the latest synced leagues
    res.json({
      leagues: syncData.leagues || [],
      updatedAt: syncData.updatedAt || 0
    });
  });

  app.post('/api/sync/leagues', (req, res) => {
    const { leagues, userId } = req.body;
    if (!Array.isArray(leagues)) {
      return res.status(400).json({ error: 'leagues must be an array' });
    }

    const syncData = readSyncData();
    const now = Date.now();

    syncData.leagues = leagues;
    syncData.updatedAt = now;

    if (userId && typeof userId === 'string') {
      if (!syncData.users) syncData.users = {};
      syncData.users[userId] = {
        leagues,
        updatedAt: now
      };
    }

    writeSyncData(syncData);
    console.log(`[Sync API] Persisted ${leagues.length} leagues (userId: ${userId || 'global'})`);
    res.json({ success: true, count: leagues.length, updatedAt: now });
  });

  // Set up session middleware for storing OAuth tokens
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(20).toString('hex'),
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      httpOnly: true,
    }
  }));

  // Yahoo OAuth Endpoints
  const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID;
  const YAHOO_CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET;

  const getRedirectUri = (req: express.Request) => {
    if (process.env.APP_URL) return `${process.env.APP_URL}/auth/yahoo/callback`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}/auth/yahoo/callback`;
  };

  app.get('/api/auth/yahoo/url', (req, res) => {
    if (!YAHOO_CLIENT_ID) {
      return res.status(500).json({ error: 'YAHOO_CLIENT_ID is not configured' });
    }
    
    // Remove prompt parameter as Yahoo is rejecting it sometimes
    const params = new URLSearchParams({
      client_id: YAHOO_CLIENT_ID,
      redirect_uri: getRedirectUri(req),
      response_type: 'code'
    });
    
    const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.get(['/auth/yahoo/callback', '/auth/yahoo/callback/'], async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    try {
      const tokenResponse = await axios.post('https://api.login.yahoo.com/oauth2/get_token', new URLSearchParams({
        client_id: YAHOO_CLIENT_ID!,
        client_secret: YAHOO_CLIENT_SECRET!,
        redirect_uri: getRedirectUri(req),
        code: code as string,
        grant_type: 'authorization_code'
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Store tokens in session
      (req.session as any).yahoo = {
        access_token,
        refresh_token,
        expires_at: Date.now() + expires_in * 1000
      };

      // Send success message to parent window and close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'YAHOO_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Error exchanging code for token:', error.response?.data || error.message);
      res.status(500).send('Failed to authenticate with Yahoo');
    }
  });

  // Proxy endpoint for Yahoo Fantasy API
  app.get('/api/yahoo/*', async (req, res) => {
    const yahooSession = (req.session as any).yahoo;
    
    if (!yahooSession || !yahooSession.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Yahoo' });
    }

    // Refresh token if expired
    if (Date.now() > yahooSession.expires_at) {
      try {
        const tokenResponse = await axios.post('https://api.login.yahoo.com/oauth2/get_token', new URLSearchParams({
          client_id: YAHOO_CLIENT_ID!,
          client_secret: YAHOO_CLIENT_SECRET!,
          redirect_uri: getRedirectUri(req),
          refresh_token: yahooSession.refresh_token,
          grant_type: 'refresh_token'
        }).toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        yahooSession.access_token = tokenResponse.data.access_token;
        yahooSession.refresh_token = tokenResponse.data.refresh_token;
        yahooSession.expires_at = Date.now() + tokenResponse.data.expires_in * 1000;
      } catch (error: any) {
        console.error('Error refreshing token:', error.response?.data || error.message);
        return res.status(401).json({ error: 'Failed to refresh Yahoo token' });
      }
    }

    const endpoint = req.params[0];
    const queryParams = new URLSearchParams(req.query as any).toString();
    const url = `https://fantasysports.yahooapis.com/fantasy/v2/${endpoint}${queryParams ? `?${queryParams}` : ''}`;

    try {
      console.log('Fetching Yahoo API URL:', url);
      console.log('With token starting with:', yahooSession.access_token.substring(0, 10) + '...');
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${yahooSession.access_token}`,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      res.json(response.data);
    } catch (error: any) {
      console.error('Error fetching from Yahoo API details:', {
        status: error.response?.status,
        data: error.response?.data,
        headers: error.response?.headers,
        url: url
      });
      res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to fetch from Yahoo API' });
    }
  });

  app.get('/api/auth/yahoo/status', (req, res) => {
    const yahooSession = (req.session as any).yahoo;
    res.json({ isAuthenticated: !!(yahooSession && yahooSession.access_token) });
  });

  app.post('/api/auth/yahoo/logout', (req, res) => {
    if ((req.session as any).yahoo) {
      delete (req.session as any).yahoo;
    }
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
