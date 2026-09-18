import { useState, useEffect, useCallback, useRef } from 'react';
import { SleeperLeague } from '../types';
import { fetchSleeperUser, fetchSleeperLeagues, fetchSleeperState } from '../services/sleeperService';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';

const STORAGE_KEY = 'synced_leagues';
const APP_ID = 'live-scores-widget';

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
  const [userId, setUserId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('userId') || params.get('uid');
      if (urlId) {
        try {
          localStorage.setItem('fsan_user_id', urlId);
        } catch {}
        console.log('[Scoreboard Sync] Found userId in URL:', urlId);
        return urlId;
      }
      try {
        const stored = localStorage.getItem('fsan_user_id');
        if (stored) {
          console.log('[Scoreboard Sync] Found userId in localStorage:', stored);
          return stored;
        }
      } catch {}
    }
    return null;
  });

  const activeUserIdRef = useRef<string | null>(userId);
  activeUserIdRef.current = userId;

  // 1. Initial load from persistent server storage (ensures mobile app & all devices have synced leagues on launch)
  useEffect(() => {
    let isCancelled = false;

    const fetchServerLeagues = async () => {
      try {
        const query = activeUserIdRef.current ? `?userId=${encodeURIComponent(activeUserIdRef.current)}` : '';
        const res = await fetch(`/api/sync/leagues${query}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.leagues) && !isCancelled) {
            console.log(`[Scoreboard Sync] Retrieved ${data.leagues.length} leagues from persistent server store`);
            setSyncedLeagues(prev => {
              // Only overwrite if server has leagues, or if local is empty
              if (data.leagues.length > 0 || prev.length === 0) {
                try {
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(data.leagues));
                } catch {}
                return data.leagues;
              }
              // If local has leagues but server was empty (e.g. initial upload), save local to server
              if (prev.length > 0 && data.leagues.length === 0) {
                fetch('/api/sync/leagues', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ leagues: prev, userId: activeUserIdRef.current })
                }).catch(() => {});
              }
              return prev;
            });
          }
        }
      } catch (err) {
        console.warn('[Scoreboard Sync] Server leagues fetch note:', err);
      }
    };

    fetchServerLeagues();
    return () => {
      isCancelled = true;
    };
  }, []);

  // 2. Listen for URL changes or postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SET_USER_ID' && event.data?.userId) {
        console.log('[Scoreboard Sync] Received SET_USER_ID via postMessage:', event.data.userId);
        setUserId(event.data.userId);
        activeUserIdRef.current = event.data.userId;
        try {
          localStorage.setItem('fsan_user_id', event.data.userId);
        } catch {}
      }
      if (event.data?.type === 'SET_FIREBASE_TOKEN' && event.data?.token) {
        signInWithCustomToken(auth, event.data.token).catch(err => {
          console.warn('[Scoreboard Sync] Could not sign in with parent token:', err);
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 3. Authenticate with Firebase (Fast anonymous auth without failing CORS calls)
  useEffect(() => {
    let isMounted = true;

    const authenticate = async () => {
      // Check if token passed in URL
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

      // Fast anonymous fallback
      try {
        const cred = await signInAnonymously(auth);
        console.log('[Scoreboard Sync] Firebase connected for user:', cred.user.uid);
      } catch (e: any) {
        console.warn('[Scoreboard Sync] Firebase auth status:', e?.message || e);
      }
    };

    authenticate();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted) return;
      if (user) {
        setUserId(prev => {
          const finalId = prev || user.uid;
          activeUserIdRef.current = finalId;
          return finalId;
        });
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 4. Real-time sync with user's own Firestore document
  useEffect(() => {
    const currentUid = auth.currentUser?.uid || userId;
    if (!currentUid) return;

    console.log('[Scoreboard Sync] Subscribing to Firestore updates for user:', currentUid);
    const userDocRef = doc(db, 'artifacts', APP_ID, 'users', currentUid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.leagues)) {
          console.log(`[Scoreboard Sync] Loaded ${data.leagues.length} leagues from Firestore (user: ${currentUid})`);
          setSyncedLeagues(data.leagues);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.leagues));
          } catch {}
        }
      }
    }, (err) => {
      console.warn('[Scoreboard Sync] Firestore subscription note:', err.message);
    });

    return () => unsubscribe();
  }, [userId]);

  // Unified save function that updates both server persistent storage and user's Firestore document
  const saveLeagues = useCallback(async (leagues: SleeperLeague[]) => {
    const currentUid = auth.currentUser?.uid || activeUserIdRef.current;
    console.log('[Scoreboard Sync] Persisting', leagues.length, 'leagues...');

    // 1. Save to persistent server API (handles mobile app restarts and cross-device sync)
    try {
      await fetch('/api/sync/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagues, userId: currentUid })
      });
      console.log('[Scoreboard Sync] Successfully saved to server store.');
    } catch (e) {
      console.warn('[Scoreboard Sync] Server API sync warning:', e);
    }

    // 2. Save to Firestore under the authenticated user's own document (valid per security rules)
    if (auth.currentUser) {
      try {
        const userDocRef = doc(db, 'artifacts', APP_ID, 'users', auth.currentUser.uid);
        await setDoc(userDocRef, { leagues, updatedAt: Date.now() });
        console.log('[Scoreboard Sync] Successfully saved to Firestore for user:', auth.currentUser.uid);
      } catch (err: any) {
        console.warn('[Scoreboard Sync] Firestore user doc save warning:', err.code, err.message);
      }
    }
  }, []);

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
    userId
  };
}
