import { useState, useEffect } from 'react';
import { SleeperLeague, SleeperUser, SleeperMatchup, SleeperRoster } from '../types';
import { fetchSleeperUser, fetchSleeperLeagues, fetchSleeperMatchups, fetchSleeperRosters, fetchSleeperUsers, fetchSleeperState } from '../services/sleeperService';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';

const STORAGE_KEY = 'synced_leagues';
const APP_ID = 'live-scores-widget';

export function useFantasy() {
  const [syncedLeagues, setSyncedLeagues] = useState<SleeperLeague[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Authenticate with Firebase (try custom token first, then fallback to anonymous)
  useEffect(() => {
    const authenticate = async () => {
      try {
        const tokenResponse = await fetch('/generate-firebase-token.php');
        if (tokenResponse.ok) {
          const data = await tokenResponse.json();
          if (data.token) {
            await signInWithCustomToken(auth, data.token);
            return;
          }
        }
      } catch (e) {
        console.log("Could not fetch custom token. Proceeding with anonymous sign-in.", e);
      }
      
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Anonymous auth failed", e);
      }
    };
    
    authenticate();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
      }
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const docRef = doc(db, 'artifacts', APP_ID, 'users', userId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.leagues) {
          setSyncedLeagues(data.leagues);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.leagues));
        }
      }
    });

    return () => unsubscribe();
  }, [userId]);

  const saveToFirebase = async (leagues: SleeperLeague[]) => {
    if (!userId) return;
    try {
      const docRef = doc(db, 'artifacts', APP_ID, 'users', userId);
      await setDoc(docRef, { leagues }, { merge: true });
    } catch (err) {
      console.error('Error saving to Firebase:', err);
    }
  };

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
      synced_user_id: 'yahoo_user', // We don't have the exact user ID right now
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
    error
  };
}
