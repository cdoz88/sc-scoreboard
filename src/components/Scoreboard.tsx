import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchScoreboard, LEAGUES } from '../services/espnService';
import { GameCard } from './GameCard';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { CalendarPicker } from './CalendarPicker';
import { Game } from '../types';
import { Dropdown } from './Dropdown';
import { AllSportsIcon, FootballIcon, BasketballIcon, BaseballIcon, HockeyIcon, GolfIcon, SoccerIcon } from './icons';
import { useIsMobile } from '../hooks/useIsMobile';
import { cn } from '../lib/utils';

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
  const isMobile = useIsMobile();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

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

  const handleSportChange = (value: string) => {
    setSelectedSport(value);
    setSelectedLeague('ALL');
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
      
      const settled = await Promise.allSettled(
        leaguesToFetch.map(id => fetchScoreboard(id, format(date, 'yyyyMMdd')))
      );
      const results: Game[] = [];
      for (const res of settled) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          results.push(...res.value);
        }
      }
      return results;
    },
    staleTime: 1000 * 45,
    refetchOnWindowFocus: false,
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
    return groups;
  }, [games]);

  return (
    <div className="space-y-4">
      <div className={cn("flex items-center gap-4 mb-6", isMobile ? "flex-col w-full" : "flex-col sm:flex-row justify-between")}>
        {/* League and Sport Filters */}
        <div className={cn("flex items-center gap-2 z-30", isMobile ? "w-full" : "w-full sm:w-auto")}>
          <div className={cn("relative", isMobile ? "flex-1" : "w-full sm:w-48")}>
            <Dropdown
              value={selectedSport}
              options={SPORT_OPTIONS}
              onChange={handleSportChange}
            />
          </div>

          <div className={cn("relative", isMobile ? "flex-1" : "w-full sm:w-40")}>
            <Dropdown
              value={selectedLeague}
              options={[
                { value: 'ALL', label: 'ALL' },
                ...availableLeagues.map(l => ({ value: l.id, label: l.name }))
              ]}
              onChange={setSelectedLeague}
              disabled={selectedSport === 'ALL SPORTS'}
            />
          </div>
        </div>

        {/* Date Navigation */}
        <div className={cn("flex items-center gap-2 z-10", isMobile ? "w-full justify-center" : "w-full sm:w-auto justify-center sm:justify-end")}>
          <button
            onClick={() => setDate(subDays(date, 1))}
            className="bg-[#2c2c2c] hover:bg-[#374151] px-3 py-2 rounded-lg text-gray-300 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          
          <div className="relative bg-[#2c2c2c] hover:bg-[#374151] rounded-lg group transition-colors flex items-center gap-2 px-4 py-2 cursor-pointer w-28 justify-between">
            <div className="text-sm font-bold text-gray-200 uppercase tracking-wide truncate">
              {isToday(date) ? 'TODAY' : format(date, 'MMM d')}
            </div>
            <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={format(date, 'yyyy-MM-dd')}
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  setDate(new Date(y, m - 1, d, 12, 0, 0));
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>

          <button
            onClick={() => setDate(addDays(date, 1))}
            className="bg-[#2c2c2c] hover:bg-[#374151] px-3 py-2 rounded-lg text-gray-300 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 bg-[#2A2A2A] animate-pulse rounded-xl border border-gray-800" />
          ))}
        </div>
      ) : games?.length === 0 ? (
        <div className="text-center py-16 bg-[#2A2A2A] rounded-xl border border-gray-800">
          <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No games scheduled for this date</p>
        </div>
      ) : (
        <div className="space-y-6">
          {LEAGUES.filter(l => groupedGames[l.id]).map(league => (
            <div key={league.id} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#9df01c]" />
                <h2 className="text-lg font-bold uppercase tracking-wider text-white">{league.name}</h2>
              </div>
              <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
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
