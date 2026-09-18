import React from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface CalendarPickerProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

export const CalendarPicker = ({ selectedDate, onSelect, onClose }: CalendarPickerProps) => {
  const [currentMonth, setCurrentMonth] = React.useState(startOfMonth(selectedDate));

  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  return (
    <div className="absolute top-full right-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 p-4">
      <div className="flex justify-between items-center mb-4">
        <button className="flex items-center gap-2 font-bold text-sm text-gray-100 hover:text-white transition-colors">
          {format(currentMonth, 'MMMM yyyy')}
          <ChevronDown size={14} className="text-gray-400" />
        </button>
        <div className="flex gap-1 text-gray-400">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-gray-800 rounded-md hover:text-white transition-colors">
            <ArrowUp size={14} />
          </button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-gray-800 rounded-md hover:text-white transition-colors">
            <ArrowDown size={14} />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-1 mb-3 text-center text-[10px] uppercase tracking-widest text-gray-500 font-bold">
        {days.map((day, i) => <div key={i}>{day}</div>)}
      </div>
      
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {calendarDays.map((day, i) => {
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          
          return (
            <button
              key={i}
              onClick={() => { onSelect(day); onClose(); }}
              style={isSelected ? { backgroundColor: '#9df01c', color: '#000' } : {}}
              className={cn(
                "p-1.5 rounded-lg transition-all flex items-center justify-center font-medium",
                !isCurrentMonth ? "text-gray-600 hover:text-gray-400" : "text-gray-300",
                isSelected 
                  ? "font-black hover:opacity-80" 
                  : "hover:bg-gray-800"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
      
      <div 
        className="flex justify-between mt-5 pt-4 border-t border-gray-800 text-[11px] uppercase tracking-widest font-bold"
        style={{ color: '#9df01c' }}
      >
        <button onClick={() => { onSelect(new Date()); onClose(); }} className="hover:opacity-80 transition-opacity">Clear</button>
        <button onClick={() => { onSelect(new Date()); onClose(); }} className="hover:opacity-80 transition-opacity">Today</button>
      </div>
    </div>
  );
};