import { Sport, League, Game } from '../types';
import { getTeamLogo } from '../lib/utils';

const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/';

export const LEAGUES: League[] = [
  { id: 'NFL', name: 'NFL', sport: 'football', endpoint: 'football/nfl/scoreboard' },
  { id: 'NCAAF', name: 'NCAAF', sport: 'football', endpoint: 'football/college-football/scoreboard' },
  { id: 'UFL', name: 'UFL', sport: 'football', endpoint: 'football/ufl/scoreboard' },
  { id: 'NBA', name: 'NBA', sport: 'basketball', endpoint: 'basketball/nba/scoreboard' },
  { id: 'WNBA', name: 'WNBA', sport: 'basketball', endpoint: 'basketball/wnba/scoreboard' },
  { id: 'NCAAB', name: 'NCAAB', sport: 'basketball', endpoint: 'basketball/mens-college-basketball/scoreboard' },
  { id: 'NCAAW', name: 'NCAAW', sport: 'basketball', endpoint: 'basketball/womens-college-basketball/scoreboard' },
  { id: 'MLB', name: 'MLB', sport: 'baseball', endpoint: 'baseball/mlb/scoreboard' },
  { id: 'CBASE', name: 'CBASE', sport: 'baseball', endpoint: 'baseball/college-baseball/scoreboard' },
  { id: 'NHL', name: 'NHL', sport: 'hockey', endpoint: 'hockey/nhl/scoreboard' },
  { id: 'PGA', name: 'PGA', sport: 'golf', endpoint: 'golf/pga/scoreboard' },
  { id: 'NASCAR', name: 'NASCAR', sport: 'racing', endpoint: 'racing/nascar-premier/scoreboard' },
  { id: 'F1', name: 'F1', sport: 'racing', endpoint: 'racing/f1/scoreboard' },
  { id: 'EPL', name: 'EPL', sport: 'soccer', endpoint: 'soccer/eng.1/scoreboard' },
  { id: 'MLS', name: 'MLS', sport: 'soccer', endpoint: 'soccer/usa.1/scoreboard' },
  { id: 'UCL', name: 'UCL', sport: 'soccer', endpoint: 'soccer/uefa.champions/scoreboard' },
  { id: 'UEL', name: 'UEL', sport: 'soccer', endpoint: 'soccer/uefa.europa/scoreboard' },
  { id: 'ESP', name: 'ESP', sport: 'soccer', endpoint: 'soccer/esp.1/scoreboard' },
  { id: 'GER', name: 'GER', sport: 'soccer', endpoint: 'soccer/ger.1/scoreboard' },
  { id: 'ITA', name: 'ITA', sport: 'soccer', endpoint: 'soccer/ita.1/scoreboard' },
  { id: 'FRA', name: 'FRA', sport: 'soccer', endpoint: 'soccer/fra.1/scoreboard' },
  { id: 'NED', name: 'NED', sport: 'soccer', endpoint: 'soccer/ned.1/scoreboard' },
  { id: 'MEX', name: 'MEX', sport: 'soccer', endpoint: 'soccer/mex.1/scoreboard' },
];

export async function fetchScoreboard(leagueId: string, date: string): Promise<Game[]> {
  const league = LEAGUES.find(l => l.id === leagueId);
  if (!league) return [];

  const targetDateStr = date.replace(/-/g, '');
  const url = `${API_BASE}${league.endpoint}?dates=${targetDateStr}`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return [];
    const data = await response.json();

    return (data.events || []).flatMap((event: any) => {
      
      // Handle Golf and Racing differently
      if (['PGA', 'NASCAR', 'F1'].includes(leagueId)) {
        
        const isRacing = ['NASCAR', 'F1'].includes(leagueId);
        
        // Strictly filter Racing sessions so FP1 only shows on Thursday, Race only shows on Sunday, etc.
        const filteredComps = (event.competitions || []).filter((comp: any) => {
            if (!isRacing || !comp.date) return true;
            
            const compDate = new Date(comp.date);
            const yyyy = compDate.getFullYear();
            const mm = String(compDate.getMonth() + 1).padStart(2, '0');
            const dd = String(compDate.getDate()).padStart(2, '0');
            
            return `${yyyy}${mm}${dd}` === targetDateStr;
        });

        return filteredComps.map((competition: any) => {
          const competitors = competition.competitors || [];
          const sortedCompetitors = competitors.sort((a: any, b: any) => (a.order || 999) - (b.order || 999));
          
          let sessionName = event.shortName || event.name;
          if (competition.type?.text) {
              sessionName = `${event.shortName || event.name} - ${competition.type.text}`;
          } else if (competition.type?.abbreviation) {
              sessionName = `${event.shortName || event.name} (${competition.type.abbreviation})`;
          }
            
          return {
            id: `${event.id}_${competition.id}`,
            league: leagueId,
            name: event.name,
            shortName: sessionName,
            date: competition.date || event.date,
            status: {
              state: competition.status?.type?.state || 'post',
              detail: competition.status?.type?.detail || 'Final',
              clock: competition.status?.clock,
              period: competition.status?.period,
            },
            golfCompetitors: sortedCompetitors, 
            awayTeam: {
              id: `${leagueId.toLowerCase()}-dummy-1`,
              name: leagueId,
              abbreviation: leagueId.substring(0, 3),
              displayName: leagueId,
              logo: '',
            },
            homeTeam: {
              id: `${leagueId.toLowerCase()}-dummy-2`,
              name: leagueId,
              abbreviation: leagueId.substring(0, 3),
              displayName: leagueId,
              logo: '',
            },
            lastPlay: competition.situation?.lastPlay?.text,
            odds: competition.odds || [],
            broadcasts: competition.broadcasts || competition.geoBroadcasts || [],
          };
        });
      }
      
      // --- Standard Team Sports Logic ---
      const competition = event.competitions?.[0];
      if (!competition) return [];

      const away = competition.competitors?.find((c: any) => c.homeAway === 'away');
      const home = competition.competitors?.find((c: any) => c.homeAway === 'home');

      if (!away || !home) return [];

      return [{
        id: event.id,
        league: leagueId,
        name: event.name,
        shortName: event.shortName,
        date: event.date,
        status: {
          state: competition.status.type.state,
          detail: competition.status.type.detail,
          clock: competition.status.clock,
          period: competition.status.period,
        },
        awayTeam: {
          id: away.team.id,
          name: away.team.name,
          abbreviation: away.team.abbreviation,
          displayName: away.team.displayName,
          logo: getTeamLogo(away.team),
          score: away.score,
          record: away.records?.find((r: any) => r.type === 'total')?.summary,
        },
        homeTeam: {
          id: home.team.id,
          name: home.team.name,
          abbreviation: home.team.abbreviation,
          displayName: home.team.displayName,
          logo: getTeamLogo(home.team),
          score: home.score,
          record: home.records?.find((r: any) => r.type === 'total')?.summary,
        },
        lastPlay: competition.situation?.lastPlay?.text,
        odds: competition.odds || [],
        broadcasts: competition.broadcasts || competition.geoBroadcasts || [],
      }];
    });
  } catch (err) {
    console.warn(`[Scoreboard] Error fetching ${leagueId}:`, err);
    return [];
  }
}

export async function fetchGameSummary(leagueId: string, gameId: string, date?: string) {
  const league = LEAGUES.find(l => l.id === leagueId);
  if (!league) return null;

  const [baseEventId, compId] = gameId.split('_');

  if (['PGA', 'NASCAR', 'F1'].includes(leagueId)) {
    let fallbackUrl = `${API_BASE}${league.endpoint}`;
    if (date) {
      const formattedDate = new Date(date).toISOString().split('T')[0].replace(/-/g, '');
      fallbackUrl += `?dates=${formattedDate}`;
    }
    const fallbackResponse = await fetch(fallbackUrl);
    if (fallbackResponse.ok) {
      const data = await fallbackResponse.json();
      const event = data.events?.find((e: any) => e.id === baseEventId);
      
      if (event) {
        const comp = compId ? event.competitions?.find((c: any) => c.id === compId) : event.competitions?.[0];
        const activeComp = comp || event.competitions?.[0];

        if (leagueId === 'F1' && activeComp && activeComp.competitors) {
            const statPromises = activeComp.competitors.map(async (c: any) => {
                try {
                    const statRes = await fetch(`https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/events/${baseEventId}/competitions/${activeComp.id}/competitors/${c.id}/statistics`);
                    if (statRes.ok) {
                        const statData = await statRes.json();
                        c.statistics = statData.splits?.categories?.[0]?.stats || statData.stats || [];
                    }
                } catch(e) {
                    console.error(`Failed to fetch deep stats for driver ${c.id}`);
                }
                return c;
            });
            
            const detailedCompetitors = await Promise.all(statPromises);
            activeComp.competitors = detailedCompetitors;
        }
        
        event.competitions = [activeComp];
        return { header: event }; 
      }
    }
    throw new Error(`Failed to fetch racing summary.`);
  }

  const leaguePath = league.endpoint.replace('/scoreboard', '');
  const url = `${API_BASE}${leaguePath}/summary?event=${baseEventId}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch game summary: ${response.statusText}`);
  }
  
  return response.json();
}