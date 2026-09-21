import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SegmentedControl } from './components/SegmentedControl';
import { Scoreboard } from './components/Scoreboard';
import { Fantasy } from './components/Fantasy';
import { GameDetails } from './components/GameDetails';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useIsMobile } from './hooks/useIsMobile';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('scores');
  const [selectedGame, setSelectedGame] = useState<{ id: string; league: string } | null>(null);

  const [scoreboardDate, setScoreboardDate] = useState(new Date());
  const [selectedSport, setSelectedSport] = useState<string>('ALL SPORTS');
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');

  const [scaleStyles, setScaleStyles] = useState<React.CSSProperties>({});

  useEffect(() => {
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobileUA && window.innerWidth > 600) {
      // Use Math.min to ensure we don't accidentally measure the scrollbar width
      const screenWidth = Math.min(window.screen.width || 390, window.innerWidth);
      const scale = window.innerWidth / screenWidth;
      
      setScaleStyles({
        width: `${screenWidth}px`,
        maxWidth: '100%',
        zoom: scale,
        overflowX: 'hidden',
        boxSizing: 'border-box'
      } as React.CSSProperties);
    }
  }, []);

  const tabs = [
    { id: 'scores', label: 'Scores' },
    { id: 'fantasy', label: 'Fantasy' },
  ];

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSelectedGame(null); 
  };

  return (
    <QueryClientProvider client={queryClient}>
      {/* Added strict overflow-hidden constraints here to kill the horizontal scroll */}
      <div style={scaleStyles} className="bg-transparent text-gray-200 selection:bg-[#9df01c] selection:text-black overflow-x-hidden max-w-full">
        <div className={cn("mx-auto p-2 sm:p-4 pb-[130px] overflow-x-hidden", isMobile ? "w-full max-w-full" : "max-w-7xl w-full")}>
          <header className="w-full flex flex-col items-center mb-4">
            <SegmentedControl
              activeTab={activeTab}
              onTabChange={handleTabChange}
              tabs={tabs}
            />
          </header>

          <main className="w-full max-w-full overflow-x-hidden">
            <AnimatePresence mode="wait">
              {selectedGame ? (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="max-w-full"
                >
                  <GameDetails 
                    gameId={selectedGame.id} 
                    leagueId={selectedGame.league} 
                    onBack={() => setSelectedGame(null)} 
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="max-w-full"
                >
                  {activeTab === 'scores' && (
                    <Scoreboard 
                      onSelectGame={(id, league) => setSelectedGame({ id, league })} 
                      date={scoreboardDate}
                      setDate={setScoreboardDate}
                      selectedSport={selectedSport}
                      setSelectedSport={setSelectedSport}
                      selectedLeague={selectedLeague}
                      setSelectedLeague={setSelectedLeague}
                    />
                  )}
                  {activeTab === 'fantasy' && <Fantasy />}
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}