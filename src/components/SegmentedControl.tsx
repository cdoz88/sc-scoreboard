import React from 'react';
import { cn } from '../lib/utils';

interface TabProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  key?: string | number;
}

const Tab = ({ active, onClick, children }: TabProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex-1 py-2 text-sm font-bold uppercase tracking-wider transition-all duration-300 rounded-full z-10",
      active ? "text-gray-900" : "text-gray-400 hover:text-gray-200"
    )}
  >
    {children}
  </button>
);

interface SegmentedControlProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

export const SegmentedControl = ({ activeTab, onTabChange, tabs }: SegmentedControlProps) => {
  const activeIndex = tabs.findIndex(t => t.id === activeTab);
  
  return (
    <div className="flex justify-center mb-4 w-full">
      <div className="relative flex flex-row bg-[#3e3e3e] p-1 rounded-full w-full max-w-[450px] select-none">
        <div
          className="absolute top-1 bottom-1 left-1 bg-[#9df01c] rounded-full transition-transform duration-300 ease-[cubic-bezier(0.4,0.0,0.2,1)]"
          style={{
            width: `calc(${100 / tabs.length}% - 3px)`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex-1 relative z-10 text-center cursor-pointer transition-colors duration-300 bg-transparent border-0 py-1.5 px-1 font-oswald text-[0.9rem] uppercase tracking-wide",
              activeTab === tab.id
                ? "text-[#1f2937] font-bold"
                : "text-[#888] font-medium hover:text-gray-200"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};
