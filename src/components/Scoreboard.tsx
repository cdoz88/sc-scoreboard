import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchScoreboard, LEAGUES } from '../services/espnService';
import { GameCard } from './GameCard';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { CalendarPicker } from './CalendarPicker';
import { Game } from '../types';
import { Dropdown } from './Dropdown';
import { AllSportsIcon, FootballIcon, BasketballIcon, BaseballIcon, HockeyIcon, GolfIcon, SoccerIcon, RacingIcon } from './icons';

interface ScoreboardProps {
  onSelectGame: (id: string, league: string) => void;
  date: Date;
  setDate: (date: Date) => void;
  selectedSport: string;
  setSelectedSport: (sport: string) => void;
  selectedLeague: string;
  setSelectedLeague: (league: string) => void;
}

const SPORT_OPTIONS = [
  { value: 'ALL SPORTS', label: 'All Sports', icon: <AllSportsIcon /> },
  { value: 'FOOTBALL', label: 'Football', icon: <FootballIcon /> },
  { value: 'BASKETBALL', label: 'Basketball', icon: <BasketballIcon /> },
  { value: 'BASEBALL', label: 'Baseball', icon: <BaseballIcon /> },
  { value: 'HOCKEY', label: 'Hockey', icon: <HockeyIcon /> },
  { value: 'GOLF', label: 'Golf', icon: <GolfIcon /> },
  { value: 'RACING', label: 'Racing', icon: <RacingIcon /> },
  { value: 'SOCCER', label: 'Soccer', icon: <SoccerIcon /> },
];

export const Scoreboard = ({ 
  onSelectGame,
  date,
  setDate,
  selectedSport,
  setSelectedSport,
  selectedLeague,
  setSelectedLeague
}: ScoreboardProps) => {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // 1. Read the URL query parameters on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const sportParam = params.get('sport');
      const leagueParam = params.get('league');

      if (leagueParam && leagueParam !== 'ALL') {
        const upperLeague = leagueParam.toUpperCase();
        setSelectedLeague(upperLeague);
        
        // Smart Detection: Auto-set the sport if they only passed the league (e.g. ?league=NBA)
        const foundLeague = LEAGUES.find(l => l.id === upperLeague);
        if (foundLeague) {
          setSelectedSport(foundLeague.sport.toUpperCase());
        }
      } else if (sportParam) {
        setSelectedSport(sportParam.toUpperCase());
        if (leagueParam === 'ALL') setSelectedLeague('ALL');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableLeagues = useMemo(() => {
    if (selectedSport === 'ALL SPORTS') return [];
    return LEAGUES.filter(l => l.sport.toUpperCase() === selectedSport);
  }, [selectedSport]);

  // 2. Update the URL dynamically when the user changes the Sport dropdown
  const handleSportChange = (value: string) => {
    setSelectedSport(value);
    setSelectedLeague('ALL');
    
    if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('sport', value);
        url.searchParams.set('league', 'ALL');
        window.history.replaceState({}, '', url.toString());
    }
  };

  // 3. Update the URL dynamically when the user changes the League dropdown
  const handleLeagueChange = (value: string) => {
    setSelectedLeague(value);
    
    if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('league', value);
        url.searchParams.set('sport', selectedSport);
        window.history.replaceState({}, '', url.toString());
    }
  };

  const { data: games, isLoading } = useQuery({
    queryKey: ['scoreboard', selectedSport, selectedLeague, format(date, 'yyyyMMdd')],
    queryFn: async () => {
      let leaguesToFetch: string[] = [];
      
      if (selectedSport === 'ALL SPORTS') {
        leaguesToFetch = LEAGUES.map(l => l.id);
      } else if (selectedLeague === 'ALL') {
        leaguesToFetch = availableLeagues.map(l => l.id);
      } else {
        leaguesToFetch = [selectedLeague];
      }
      
      const results = await Promise.all(
        leaguesToFetch.map(id => fetchScoreboard(id, format(date, 'yyyyMMdd')))
      );
      return results.flat();
    },
  });

  const groupedGames = useMemo(() => {
    if (!games) return {};
    const groups: Record<string, Game[]> = {};
    
    games.forEach(game => {
      if (!groups[game.league]) {
        groups[game.league] = [];
      }
      groups[game.league].push(game);
    });

    const stateRank: Record<string, number> = { 'in': 1, 'pre': 2, 'post': 3 };
    
    Object.keys(groups).forEach(league => {
      groups[league].sort((a, b) => {
        const rankA = stateRank[a.status.state] || 4;
        const rankB = stateRank[b.status.state] || 4;
        return rankA - rankB;
      });
    });

    return groups;
  }, [games]);

  return (
    <div className="space-y-6 min-h-[450px]">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
        <div className="flex items-center gap-2 w-full sm:w-auto z-30">
          <div className="relative w-full sm:w-48">
            <Dropdown
              value={selectedSport}
              options={SPORT_OPTIONS}
              onChange={handleSportChange}
            />
          </div>

          <div className="relative w-full sm:w-40">
            <Dropdown
              value={selectedLeague}
              options={[
                { value: 'ALL', label: 'ALL' },
                ...availableLeagues.map(l => ({ value: l.id, label: l.name }))
              ]}
              onChange={handleLeagueChange}
              disabled={selectedSport === 'ALL SPORTS'}
            />
          </div>
        </div>

        <div className="relative flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end z-50" ref={calendarRef}>
          <button
            onClick={() => setDate(subDays(date, 1))}
            className="p-2.5 bg-[#2c2c2c] hover:bg-[#374151] rounded-lg transition-colors text-gray-300"
          >
            <ChevronLeft size={16} />
          </button>
          
          <button
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            className="flex items-center justify-center gap-2 w-32 px-4 py-2.5 bg-[#2c2c2c] hover:bg-[#374151] rounded-lg transition-colors font-bold text-sm text-gray-200 uppercase tracking-wide cursor-pointer"
          >
            <span className="pointer-events-none">{isToday(date) ? 'TODAY' : format(date, 'MMM d')}</span>
            <ChevronDown size={14} className="text-gray-400 pointer-events-none" />
          </button>

          <button
            onClick={() => setDate(addDays(date, 1))}
            className="p-2.5 bg-[#2c2c2c] hover:bg-[#374151] rounded-lg transition-colors text-gray-300"
          >
            <ChevronRight size={16} />
          </button>

          {isCalendarOpen && (
            <CalendarPicker 
              selectedDate={date} 
              onSelect={setDate} 
              onClose={() => setIsCalendarOpen(false)} 
            />
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-40 bg-gray-800/50 animate-pulse rounded-xl border border-gray-700/50" />
          ))}
        </div>
      ) : games?.length === 0 ? (
        <div className="text-center py-20 bg-gray-800/30 rounded-2xl border border-dashed border-gray-700">
          <p className="text-gray-500 font-bold uppercase tracking-widest">No games scheduled</p>
        </div>
      ) : (
        <div className="space-y-8">
          {LEAGUES.filter(l => groupedGames[l.id]).map(league => (
            <div key={league.id} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                <div className="w-3 h-3 rounded-full bg-[#9df01c] shadow-sm" />
                <h2 className="text-xl font-black uppercase tracking-widest">{league.name}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groupedGames[league.id].map(game => (
                  <GameCard 
                    key={game.id} 
                    game={game} 
                    onClick={() => onSelectGame(game.id, game.league)} 
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};