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

export const GameCard = ({ game, onClick }: GameCardProps) => {
  const isPre = game.status.state === 'pre';
  const isLive = game.status.state === 'in';
  const isPost = game.status.state === 'post';

  if (game.league === 'PGA' && game.golfCompetitors) {
    const eventName = game.shortName || game.name || 'Event';
    const top3Competitors = game.golfCompetitors.slice(0, 3);
    
    return (
      <div
        onClick={onClick}
        className="card-bg rounded-lg shadow-lg overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform duration-300 flex flex-col justify-between h-full border border-gray-800 hover:border-gray-600"
      >
        <div className="p-3 flex flex-col h-full">
          <div className="flex justify-between items-start text-xs uppercase font-bold mb-2">
            <span className="text-gray-500">{game.league}</span>
            <span className="accent-text text-right">{game.status.detail}</span>
          </div>
          <div className="font-bold text-white text-base leading-tight mb-3">{eventName}</div>
          <div className="space-y-1.5">
            {top3Competitors.map((c: any, i: number) => (
              <div key={i} className="flex justify-between text-sm items-center">
                <span className="text-gray-300 truncate pr-2">{c.athlete?.displayName || c.team?.displayName}</span>
                <span className="font-bold text-white bg-[#1f2937] px-1.5 rounded">{c.score || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const awaySpread = getTeamSpread(game.odds, game.awayTeam.abbreviation);
  const homeSpread = getTeamSpread(game.odds, game.homeTeam.abbreviation);

  const statusText = isPre ? formatGameTime(game.date) : game.status.detail;
  
  let bottomText = '';
  if (isPre) {
    if (game.odds?.[0]?.overUnder) {
      bottomText = `O/U ${game.odds[0].overUnder}`;
    }
  } else {
    if (game.lastPlay) {
      bottomText = game.lastPlay;
    } else if (isPost) {
      bottomText = "Final";
    }
  }

  return (
    <div
      onClick={onClick}
      className="card-bg rounded-lg shadow-lg overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform duration-300 flex flex-col justify-between h-full border border-gray-800 hover:border-gray-600"
    >
      <div className="p-2 flex items-center justify-between flex-grow">
        <div className="flex flex-col gap-2 w-[65%]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <img
                src={game.awayTeam.logo}
                alt={game.awayTeam.name}
                className="w-6 h-6 object-contain flex-shrink-0"
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.src = `https://placehold.co/48x48/1f2937/ffffff?text=${game.awayTeam.abbreviation || '?'}`; }}
              />
              <span className={cn(
                "font-bold text-sm truncate",
                isPost && parseInt(game.awayTeam.score || '0') > parseInt(game.homeTeam.score || '0') ? "text-white" : "text-gray-200"
              )}>
                {game.awayTeam.abbreviation || game.awayTeam.name.substring(0, 3).toUpperCase()}
              </span>
            </div>
            {isPre ? (
              <span className="text-gray-500 font-bold text-sm text-right min-w-[3rem] flex-shrink-0">
                {awaySpread || ''}
              </span>
            ) : (
              <span className={cn(
                "font-bold text-lg text-right min-w-[3rem] flex-shrink-0",
                isPost && parseInt(game.awayTeam.score || '0') > parseInt(game.homeTeam.score || '0') ? "text-white" : "text-gray-200"
              )}>
                {game.awayTeam.score || '0'}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <img
                src={game.homeTeam.logo}
                alt={game.homeTeam.name}
                className="w-6 h-6 object-contain flex-shrink-0"
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.src = `https://placehold.co/48x48/1f2937/ffffff?text=${game.homeTeam.abbreviation || '?'}`; }}
              />
              <span className={cn(
                "font-bold text-sm truncate",
                isPost && parseInt(game.homeTeam.score || '0') > parseInt(game.awayTeam.score || '0') ? "text-white" : "text-gray-200"
              )}>
                {game.homeTeam.abbreviation || game.homeTeam.name.substring(0, 3).toUpperCase()}
              </span>
            </div>
            {isPre ? (
              <span className="text-gray-500 font-bold text-sm text-right min-w-[3rem] flex-shrink-0">
                {homeSpread || ''}
              </span>
            ) : (
              <span className={cn(
                "font-bold text-lg text-right min-w-[3rem] flex-shrink-0",
                isPost && parseInt(game.homeTeam.score || '0') > parseInt(game.awayTeam.score || '0') ? "text-white" : "text-gray-200"
              )}>
                {game.homeTeam.score || '0'}
              </span>
            )}
          </div>
        </div>

        <div className="w-[35%] flex justify-end pl-2">
          <span className="accent-text font-bold text-xs uppercase text-right leading-tight break-words">
            {statusText}
          </span>
        </div>
      </div>

      {bottomText && (
        <div className="border-t border-gray-700 px-3 py-1 bg-[#252525]">
          <p className="text-xs text-gray-400 truncate">{bottomText}</p>
        </div>
      )}
    </div>
  );
};
