import { useState, useEffect, useCallback, useRef } from 'react';
import { SleeperLeague } from '../types';
import { fetchSleeperUser, fetchSleeperLeagues, fetchSleeperState } from '../services/sleeperService';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';

const STORAGE_KEY = 'synced_leagues';
const APP_ID = 'live-scores-widget';
const DEFAULT_ACCOUNT = 'corey@fsan.com';

export function useFantasy() {
  const [syncedLeagues, setSyncedLeagues] = useState<SleeperLeague[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userAccount, setUserAccountState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlAccount = params.get('email') || params.get('user') || params.get('userId') || params.get('uid') || params.get('account');
      if (urlAccount) {
        try {
          localStorage.setItem('fsan_user_account', urlAccount.trim().toLowerCase());
        } catch {}
        console.log('[Scoreboard Sync] Found user account in URL:', urlAccount);
        return urlAccount.trim().toLowerCase();
      }
      try {
        const stored = localStorage.getItem('fsan_user_account') || localStorage.getItem('fsan_user_id');
        if (stored) {
          console.log('[Scoreboard Sync] Found user account in localStorage:', stored);
          return stored.trim().toLowerCase();
        }
      } catch {}
    }
    return DEFAULT_ACCOUNT;
  });

  const accountRef = useRef<string>(userAccount);
  accountRef.current = userAccount;

  const syncedLeaguesRef = useRef<SleeperLeague[]>(syncedLeagues);
  syncedLeaguesRef.current = syncedLeagues;

  const lastUpdatedAtRef = useRef<number>(0);

  // 1. Fetch leagues from persistent server storage for the specific user account
  const fetchServerLeagues = useCallback(async (targetAccount: string) => {
    try {
      const query = `?userId=${encodeURIComponent(targetAccount)}`;
      const res = await fetch(`/api/sync/leagues${query}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.leagues)) {
          console.log(`[Scoreboard Sync] Retrieved ${data.leagues.length} leagues from persistent server store for ${targetAccount}`);
          lastUpdatedAtRef.current = data.updatedAt || Date.now();
          setSyncedLeagues(prev => {
            // Overwrite if server has data or if local is empty
            if (data.leagues.length > 0 || prev.length === 0) {
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data.leagues));
              } catch {}
              return data.leagues;
            }
            // If local has leagues but server is empty, upload local to server
            if (prev.length > 0 && data.leagues.length === 0) {
              fetch('/api/sync/leagues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagues: prev, userId: targetAccount, email: targetAccount })
              }).catch(() => {});
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.warn('[Scoreboard Sync] Server leagues fetch note:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchServerLeagues(accountRef.current);
  }, [fetchServerLeagues]);

  // 2. Periodic background sync and focus sync (updates cross-device changes within seconds)
  useEffect(() => {
    const checkSync = async () => {
      try {
        const query = `?userId=${encodeURIComponent(accountRef.current)}`;
        const res = await fetch(`/api/sync/leagues${query}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.leagues) && data.updatedAt && data.updatedAt > lastUpdatedAtRef.current) {
            console.log(`[Scoreboard Sync] Newer leagues received from cross-device sync (${data.leagues.length} leagues)`);
            lastUpdatedAtRef.current = data.updatedAt;
            setSyncedLeagues(data.leagues);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(data.leagues));
            } catch {}
          }
        }
      } catch {}
    };

    const interval = setInterval(checkSync, 10000); // Check every 10s
    window.addEventListener('focus', checkSync);
    document.addEventListener('visibilitychange', checkSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkSync);
      document.removeEventListener('visibilitychange', checkSync);
    };
  }, []);

  // 3. Listen for parent postMessage (e.g. wrapper app providing account or token)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const incomingId = event.data?.userId || event.data?.email || event.data?.account;
      if ((event.data?.type === 'SET_USER_ID' || event.data?.type === 'SET_USER_EMAIL') && incomingId) {
        console.log('[Scoreboard Sync] Received account via postMessage:', incomingId);
        const normalized = incomingId.trim().toLowerCase();
        setUserAccountState(normalized);
        accountRef.current = normalized;
        try {
          localStorage.setItem('fsan_user_account', normalized);
        } catch {}
        fetchServerLeagues(normalized);
      }
      if (event.data?.type === 'SET_FIREBASE_TOKEN' && event.data?.token) {
        signInWithCustomToken(auth, event.data.token).catch(err => {
          console.warn('[Scoreboard Sync] Could not sign in with parent token:', err);
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchServerLeagues]);

  // 4. Authenticate with Firebase
  useEffect(() => {
    let isMounted = true;

    const authenticate = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token') || params.get('firebaseToken');
      if (urlToken) {
        try {
          await signInWithCustomToken(auth, urlToken);
          console.log('[Scoreboard Sync] Authenticated with custom token from URL');
          return;
        } catch (e) {
          console.warn('[Scoreboard Sync] URL custom token sign-in failed:', e);
        }
      }

      try {
        const cred = await signInAnonymously(auth);
        console.log('[Scoreboard Sync] Firebase connected for user:', cred.user.uid);
      } catch (e: any) {
        console.warn('[Scoreboard Sync] Firebase auth status:', e?.message || e);
      }
    };

    authenticate();

    const unsubscribe = onAuthStateChanged(auth, () => {});
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 5. Real-time sync with authenticated user's Firestore document
  useEffect(() => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;

    console.log('[Scoreboard Sync] Subscribing to Firestore updates for user:', currentUid);
    const userDocRef = doc(db, 'artifacts', APP_ID, 'users', currentUid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.leagues)) {
          if (data.leagues.length > 0) {
            console.log(`[Scoreboard Sync] Loaded ${data.leagues.length} leagues from Firestore`);
            lastUpdatedAtRef.current = data.updatedAt || Date.now();
            setSyncedLeagues(data.leagues);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(data.leagues));
            } catch {}
          } else if (syncedLeaguesRef.current.length > 0) {
            // Protect against empty wipe: seed Firestore with current local leagues
            console.log('[Scoreboard Sync] Seeding Firestore document with local leagues');
            setDoc(userDocRef, { 
              leagues: syncedLeaguesRef.current, 
              account: accountRef.current, 
              updatedAt: Date.now() 
            }).catch(() => {});
          }
        }
      }
    }, (err) => {
      console.warn('[Scoreboard Sync] Firestore subscription note:', err.message);
    });

    return () => unsubscribe();
  }, []);

  // Unified save function that updates both server persistent storage and user's Firestore document
  const saveLeagues = useCallback(async (leagues: SleeperLeague[]) => {
    const currentAccount = accountRef.current;
    console.log('[Scoreboard Sync] Persisting', leagues.length, 'leagues for', currentAccount);
    lastUpdatedAtRef.current = Date.now();

    // 1. Save to persistent server API
    try {
      await fetch('/api/sync/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          leagues, 
          userId: currentAccount, 
          email: currentAccount 
        })
      });
      console.log('[Scoreboard Sync] Successfully saved to server store for', currentAccount);
    } catch (e) {
      console.warn('[Scoreboard Sync] Server API sync warning:', e);
    }

    // 2. Save to Firestore under authenticated user's doc
    if (auth.currentUser) {
      try {
        const userDocRef = doc(db, 'artifacts', APP_ID, 'users', auth.currentUser.uid);
        await setDoc(userDocRef, { 
          leagues, 
          account: currentAccount, 
          updatedAt: Date.now() 
        });
        console.log('[Scoreboard Sync] Successfully saved to Firestore for user:', auth.currentUser.uid);
      } catch (err: any) {
        console.warn('[Scoreboard Sync] Firestore user doc save warning:', err.code, err.message);
      }
    }
  }, []);

  const setUserAccount = useCallback((newAccount: string) => {
    const trimmed = newAccount.trim().toLowerCase();
    if (!trimmed) return;
    console.log('[Scoreboard Sync] Switching user account to:', trimmed);
    setUserAccountState(trimmed);
    accountRef.current = trimmed;
    try {
      localStorage.setItem('fsan_user_account', trimmed);
    } catch {}
    fetchServerLeagues(trimmed);
  }, [fetchServerLeagues]);

  const syncLeague = async (username: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await fetchSleeperUser(username);
      if (!user) throw new Error('User not found');
      
      const state = await fetchSleeperState();
      const season = state?.season_type === 'off' || state?.season_type === 'pre' ? state.previous_season : (state?.season || '2024');
      const leagues = await fetchSleeperLeagues(user.user_id, season);
      
      if (leagues.length === 0) throw new Error('No leagues found');
      
      const newLeagues = leagues.filter(
        (l: SleeperLeague) => !syncedLeagues.some(sl => sl.league_id === l.league_id)
      ).map((l: SleeperLeague) => ({ ...l, synced_user_id: user.user_id, platform: 'Sleeper' }));
      
      const updatedExistingLeagues = syncedLeagues.map(sl => {
        if (!sl.synced_user_id && leagues.some((l: SleeperLeague) => l.league_id === sl.league_id)) {
          return { ...sl, synced_user_id: user.user_id, platform: 'Sleeper' };
        }
        return sl;
      });
      
      const allLeagues = [...updatedExistingLeagues, ...newLeagues];
      setSyncedLeagues(allLeagues);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allLeagues));
      } catch {}
      await saveLeagues(allLeagues);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const addYahooLeague = (yahooLeague: any) => {
    const newLeague: any = {
      league_id: yahooLeague.league_key,
      name: yahooLeague.name,
      sport: 'nfl',
      season: yahooLeague.season,
      status: 'active',
      total_rosters: yahooLeague.num_teams,
      avatar: yahooLeague.logo_url,
      synced_user_id: 'yahoo_user',
      platform: 'Yahoo'
    };
    
    if (!syncedLeagues.some(sl => sl.league_id === newLeague.league_id)) {
      const allLeagues = [...syncedLeagues, newLeague];
      setSyncedLeagues(allLeagues);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allLeagues));
      } catch {}
      saveLeagues(allLeagues);
    }
  };

  const removeLeague = (leagueId: string) => {
    const allLeagues = syncedLeagues.filter(l => l.league_id !== leagueId);
    setSyncedLeagues(allLeagues);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allLeagues));
    } catch {}
    saveLeagues(allLeagues);
  };

  return {
    syncedLeagues,
    syncLeague,
    addYahooLeague,
    removeLeague,
    isLoading,
    error,
    userAccount,
    setUserAccount
  };
}
