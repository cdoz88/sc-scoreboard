import React from 'react';
import { Game } from '../types';
import { formatGameTime, cn, getTeamLogo } from '../lib/utils';

interface GameCardProps {
  game: Game;
  onClick: () => void;
  key?: string | number;
}

export function getTeamSpread(odds: any[] | undefined, teamAbbreviation: string) {
  if (!odds || odds.length === 0) return null;
  const primaryOdds = odds[0];
  if (!primaryOdds || !primaryOdds.details) return null;
  
  if (primaryOdds.details.toUpperCase() === 'EVEN') return 'EVEN';
  
  const parts = primaryOdds.details.split(' ');
  if (parts.length >= 2) {
    const favTeam = parts[0];
    const spreadStr = parts[1];
    const spread = parseFloat(spreadStr);
    
    if (isNaN(spread)) return null;

    if (favTeam === teamAbbreviation) {
      return spread > 0 ? `+${spread}` : `${spread}`;
    } else {
      return spread > 0 ? `-${spread}` : `+${Math.abs(spread)}`;
    }
  }
  return null;
}

const TeamRow = ({ team, isWinner, isPre, spread }: { team: any, isWinner: boolean, isPre: boolean, spread: string | null }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <img
        src={team.logo}
        alt={team.name}
        className="w-6 h-6 object-contain"
        referrerPolicy="no-referrer"
        onError={(e) => { e.currentTarget.src = `https://placehold.co/48x48/1f2937/ffffff?text=${team.abbreviation || '?'}` }}
      />
      <span className={cn(
        "font-bold text-sm tracking-tight",
        isWinner ? "text-white" : "text-gray-400"
      )}>
        {team.abbreviation}
      </span>
    </div>
    <div className="flex items-center gap-3">
      {spread && (
        <span className="text-xs font-bold text-gray-500 w-12 text-right">
          {spread}
        </span>
      )}
      {!isPre && (
        <span className={cn(
          "font-black text-lg w-8 text-right",
          isWinner ? "text-white" : "text-gray-500"
        )}>
          {team.score}
        </span>
      )}
    </div>
  </div>
);

export const GameCard = ({ game, onClick }: GameCardProps) => {
  const isPre = game.status.state === 'pre';
  const isLive = game.status.state === 'in';
  const isPost = game.status.state === 'post';

  // Render leaderboard card for Golf and Racing (NASCAR/F1)
  if (['PGA', 'NASCAR', 'F1'].includes(game.league) && game.golfCompetitors) {
    const eventName = game.shortName || game.name || 'Event';
    const top3Competitors = game.golfCompetitors.slice(0, 3);
    
    return (
      <div
        onClick={onClick}
        className="bg-[#2A2A2A] rounded-xl border border-gray-800 hover:border-gray-600 transition-all duration-300 cursor-pointer overflow-hidden group flex flex-col h-full"
      >
        <div className="p-3 flex flex-col h-full">
          <div className="flex justify-between items-start text-xs uppercase font-bold mb-2">
            <span className="text-gray-500">{game.league}</span>
            <span className={cn(
              "text-right",
              isLive ? "text-[#9df01c]" : isPre ? "text-white" : "text-gray-400"
            )}>
              {game.status.detail}
            </span>
          </div>
          <div className="font-bold text-white text-base leading-tight mb-3">{eventName}</div>
          <div className="space-y-1.5 mt-auto">
            {top3Competitors.map((c: any, i: number) => {
              const getDynamicStat = (keywords: string[]) => {
                 const arr = c.statistics || c.stats || c.athlete?.statistics || c.athlete?.stats || [];
                 const stat = arr.find((s: any) => keywords.some(k => (s.name||'').toLowerCase().includes(k) || (s.label||'').toLowerCase().includes(k) || (s.abbreviation||'').toLowerCase().includes(k)));
                 if (stat) return stat.displayValue ?? stat.value;
                 
                 const key = Object.keys(c).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
                 if (key) return c[key];
                 
                 return null;
              };
              
              let carNum = c.athlete?.jersey || c.car || getDynamicStat(['car']);
              if (carNum === '-') carNum = '';
              const displayCar = carNum ? `#${carNum}` : '';
              
              let rightSide = '-';
              if (['NASCAR', 'F1'].includes(game.league)) {
                 const pts = getDynamicStat(['point', 'pts', 'score']);
                 const time = getDynamicStat(['tot', 'time']);
                 const laps = getDynamicStat(['lap']);
                 const fallbackStatus = c.status?.displayValue || c.reason?.displayValue || c.status?.type?.detail || (c.order === 1 ? 'Winner' : 'Finished');
                 
                 if (isPre) rightSide = displayCar || '-';
                 else if (isLive) rightSide = laps ? `L: ${laps}` : 'Running';
                 else rightSide = pts ? `${pts} pts` : (c.score ? `${c.score} pts` : (time ? time : fallbackStatus));
              } else {
                 const pointsStat = c.statistics?.find((s: any) => s.name === 'points');
                 rightSide = c.score ?? c.points ?? pointsStat?.displayValue ?? c.statistics?.[0]?.displayValue ?? c.linescores?.[0]?.value ?? '-';
              }

              return (
                <div key={i} className="flex justify-between text-sm items-center">
                  <div className="flex items-center gap-1.5 truncate pr-2">
                     <span className="text-gray-500 font-bold text-xs w-4">{c.order || i+1}.</span>
                     <span className="text-gray-200 font-bold truncate">{c.athlete?.shortName || c.athlete?.displayName || c.team?.displayName}</span>
                     {['NASCAR', 'F1'].includes(game.league) && displayCar && <span className="text-[10px] text-gray-500 font-mono ml-1">{displayCar}</span>}
                  </div>
                  <span className="font-bold text-white bg-[#1f2937] px-1.5 py-0.5 rounded whitespace-nowrap uppercase">{rightSide}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const awaySpread = getTeamSpread(game.odds, game.awayTeam.abbreviation);
  const homeSpread = getTeamSpread(game.odds, game.homeTeam.abbreviation);

  return (
    <div
      onClick={onClick}
      className="bg-[#2A2A2A] rounded-xl border border-gray-800 hover:border-gray-600 transition-all duration-300 cursor-pointer overflow-hidden group"
    >
      <div className="p-3 flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <TeamRow team={game.awayTeam} isWinner={isPost && parseInt(game.awayTeam.score || '0') > parseInt(game.homeTeam.score || '0')} isPre={isPre} spread={awaySpread} />
          <TeamRow team={game.homeTeam} isWinner={isPost && parseInt(game.homeTeam.score || '0') > parseInt(game.awayTeam.score || '0')} isPre={isPre} spread={homeSpread} />
        </div>
        <div className="ml-4 flex flex-col items-end justify-center min-w-[60px]">
          <span className={cn(
            "text-xs font-bold uppercase tracking-widest text-right",
            isLive ? "text-[#9df01c]" : isPre ? "text-white" : "text-gray-400"
          )}>
            {isPre ? formatGameTime(game.date) : game.status.detail}
          </span>
        </div>
      </div>
      {(game.lastPlay || (game.odds && game.odds.length > 0 && game.odds[0]?.overUnder)) && (
        <div className="bg-[#252525] px-3 py-1.5 border-t border-gray-800">
          <p className="text-[10px] text-gray-500 truncate uppercase tracking-tight">
            {isPre && game.odds && game.odds.length > 0 && game.odds[0]?.overUnder 
              ? `O/U ${game.odds[0].overUnder}` 
              : game.lastPlay || (game.odds?.[0]?.overUnder ? `O/U ${game.odds[0].overUnder}` : '')}
          </p>
        </div>
      )}
    </div>
  );
};