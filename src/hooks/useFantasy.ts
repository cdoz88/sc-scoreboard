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

      // 2. Fetch custom token from generate-firebase-token.php on selloutcrowds.com
      // (This was how the original FileZilla HTML synced users logged into selloutcrowds.com)
      const tokenEndpoints = [
        '/generate-firebase-token.php',
        'https://www.selloutcrowds.com/generate-firebase-token.php',
        'https://selloutcrowds.com/generate-firebase-token.php'
      ];

      for (const endpoint of tokenEndpoints) {
        try {
          const res = await fetch(endpoint, { credentials: 'include' });
          if (res.ok) {
            const text = await res.text();
            if (text.trim().startsWith('{')) {
              const data = JSON.parse(text);
              if (data.token) {
                console.log('[Scoreboard Sync] Retrieved token from', endpoint);
                await signInWithCustomToken(auth, data.token);
                return;
              }
            }
          }
        } catch (err) {
          // Continue to next endpoint or anonymous fallback
        }
      }

      // 3. Fallback to anonymous authentication
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

  // Real-time sync with Firestore (both personal user doc and shared global doc)
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const handleIncomingLeagues = (incoming: any, source: string) => {
      if (Array.isArray(incoming) && incoming.length > 0) {
        console.log(`[Scoreboard Sync] Loaded ${incoming.length} leagues from Firestore (${source})`);
        setSyncedLeagues(prev => {
          // If we already have the exact same leagues, avoid re-render
          if (JSON.stringify(prev) === JSON.stringify(incoming)) {
            return prev;
          }
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
          } catch {}
          return incoming;
        });
      }
    };

    // 1. Subscribe to shared global sync document (enables cross-device sync across all devices)
    try {
      const sharedDocRef = doc(db, 'artifacts', APP_ID, 'shared', 'synced_leagues');
      const unsubShared = onSnapshot(sharedDocRef, (snap) => {
        if (snap.exists()) {
          handleIncomingLeagues(snap.data()?.leagues, 'shared document');
        } else {
          // Fallback to default user document
          const defaultDocRef = doc(db, 'artifacts', APP_ID, 'users', 'default');
          onSnapshot(defaultDocRef, (defSnap) => {
            if (defSnap.exists()) {
              handleIncomingLeagues(defSnap.data()?.leagues, 'default user document');
            }
          });
        }
      }, (err) => {
        console.warn('[Scoreboard Sync] Shared doc subscription note:', err.message);
      });
      unsubs.push(unsubShared);
    } catch (e) {
      console.warn('[Scoreboard Sync] Could not subscribe to shared doc:', e);
    }

    // 2. Subscribe to user-specific document if userId exists
    if (userId) {
      try {
        console.log('[Scoreboard Sync] Subscribing to Firestore updates for user:', userId);
        const userDocRef = doc(db, 'artifacts', APP_ID, 'users', userId);
        const unsubUser = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            handleIncomingLeagues(snap.data()?.leagues, `user ${userId}`);
          }
        }, (err) => {
          console.warn('[Scoreboard Sync] User doc subscription error:', err.message);
        });
        unsubs.push(unsubUser);
      } catch (e) {
        console.warn('[Scoreboard Sync] Could not subscribe to user doc:', e);
      }
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [userId]);

  const saveToFirebase = useCallback(async (leagues: SleeperLeague[]) => {
    const currentId = activeUserIdRef.current;
    try {
      console.log('[Scoreboard Sync] Saving', leagues.length, 'leagues to Firestore...');
      
      // 1. Always save to the shared global document for automatic cross-device sync
      const sharedDocRef = doc(db, 'artifacts', APP_ID, 'shared', 'synced_leagues');
      await setDoc(sharedDocRef, { leagues, updatedAt: Date.now() }, { merge: true });

      // 2. Also write to default user doc as backup
      const defaultDocRef = doc(db, 'artifacts', APP_ID, 'users', 'default');
      await setDoc(defaultDocRef, { leagues, updatedAt: Date.now() }, { merge: true });

      // 3. If user has a specific ID (from URL, token, or session), also save to their document
      if (currentId && currentId !== 'default') {
        const userDocRef = doc(db, 'artifacts', APP_ID, 'users', currentId);
        await setDoc(userDocRef, { leagues, updatedAt: Date.now() }, { merge: true });
      }

      console.log('[Scoreboard Sync] Successfully saved leagues to Firestore (shared + user)!');
    } catch (err: any) {
      console.error('[Scoreboard Sync] Failed to save to Firebase:', err.code, err.message);
    }
  }, []);

  // When initial local leagues exist, ensure they are seeded to the shared cloud document once auth is ready
  useEffect(() => {
    if (syncedLeagues.length > 0) {
      const timer = setTimeout(() => {
        saveToFirebase(syncedLeagues);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [saveToFirebase]);

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
