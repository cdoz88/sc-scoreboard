/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SegmentedControl } from './components/SegmentedControl';
import { Scoreboard } from './components/Scoreboard';
import { Fantasy } from './components/Fantasy';
import { GameDetails } from './components/GameDetails';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  const [activeTab, setActiveTab] = useState('scores');
  const [selectedGame, setSelectedGame] = useState<{ id: string; league: string } | null>(null);

  // Lifted Scoreboard state
  const [scoreboardDate, setScoreboardDate] = useState(new Date());
  const [selectedSport, setSelectedSport] = useState<string>('ALL SPORTS');
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');

  const tabs = [
    { id: 'scores', label: 'Scores' },
    { id: 'fantasy', label: 'Fantasy' },
  ];

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSelectedGame(null); // Reset detail view when switching tabs
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-full max-w-full min-h-screen bg-transparent text-gray-200 selection:bg-[#9df01c] selection:text-black no-scrollbar overflow-x-hidden overflow-y-auto">
        <div className="w-full max-w-full sm:max-w-7xl mx-auto p-2 sm:p-4 pb-28 sm:pb-8 overflow-x-hidden">
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
