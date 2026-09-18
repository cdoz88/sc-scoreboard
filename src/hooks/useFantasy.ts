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

  // Sync state if URL changes or postMessage arrives
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

  // Authenticate with Firebase (Anonymous auth for session)
  useEffect(() => {
    let isMounted = true;

    const authenticate = async () => {
      // 1. Check if token passed in URL
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

      // 2. Sign in anonymously to establish a valid Firebase Auth session
      try {
        const cred = await signInAnonymously(auth);
        console.log('[Scoreboard Sync] Firebase anonymous auth connected:', cred.user.uid);
      } catch (e: any) {
        if (e?.code === 'auth/requests-from-referer-are-blocked' || e?.message?.includes('requests-from-referer')) {
          console.warn(
            '[Scoreboard Sync] Domain blocked by Firebase API Key restrictions. ' +
            'Please verify both Authorized Domains in Firebase Auth AND Website Restrictions in Google Cloud API Credentials for: ' +
            window.location.origin
          );
        } else {
          console.warn('[Scoreboard Sync] Firebase auth status:', e?.message || e);
        }
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

  // Real-time sync with Firestore whenever userId is available
  useEffect(() => {
    if (!userId) return;

    console.log('[Scoreboard Sync] Subscribing to Firestore updates for user:', userId);
    const docRef = doc(db, 'artifacts', APP_ID, 'users', userId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.leagues)) {
          console.log('[Scoreboard Sync] Loaded', data.leagues.length, 'leagues from Firestore for user:', userId);
          setSyncedLeagues(data.leagues);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.leagues));
        }
      } else {
        console.log('[Scoreboard Sync] No existing cloud record found for user:', userId);
      }
    }, (err) => {
      console.error('[Scoreboard Sync] Firestore subscription error:', err.code, err.message);
    });

    return () => unsubscribe();
  }, [userId]);

  const saveToFirebase = useCallback(async (leagues: SleeperLeague[]) => {
    const currentId = activeUserIdRef.current;
    if (!currentId) {
      console.warn('[Scoreboard Sync] Cannot save to Firebase: No active userId yet.');
      return;
    }
    try {
      console.log('[Scoreboard Sync] Saving', leagues.length, 'leagues to Firestore for user:', currentId);
      const docRef = doc(db, 'artifacts', APP_ID, 'users', currentId);
      await setDoc(docRef, { leagues, updatedAt: Date.now() }, { merge: true });
      console.log('[Scoreboard Sync] Successfully saved leagues to Firestore!');
    } catch (err: any) {
      console.error('[Scoreboard Sync] Failed to save to Firebase:', err.code, err.message);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allLeagues));
      await saveToFirebase(allLeagues);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allLeagues));
      saveToFirebase(allLeagues);
    }
  };

  const removeLeague = (leagueId: string) => {
    const allLeagues = syncedLeagues.filter(l => l.league_id !== leagueId);
    setSyncedLeagues(allLeagues);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allLeagues));
    saveToFirebase(allLeagues);
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
