'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { LogStatus } from '@/lib/types';

interface DateNavigatorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  /** Map of date strings (YYYY-MM-DD) to their log status */
  dayStatuses?: Map<string, LogStatus>;
}

// Status dot colors
const STATUS_DOT_COLORS: Record<LogStatus, string> = {
  complete: '#10B981', // Green
  partial: '#F59E0B', // Amber
  skipped: '#6B7280', // Gray
};

// Helper to format date for display
function formatDisplayDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  
  if (compareDate.getTime() === today.getTime()) {
    return 'Today';
  }
  if (compareDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }
  
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Helper to check if date is today
function isToday(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate.getTime() === today.getTime();
}

// Helper to get days in month
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to get first day of month (0 = Sunday)
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// Helper to format date to YYYY-MM-DD
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DateNavigator({ selectedDate, onDateChange, dayStatuses }: DateNavigatorProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(selectedDate.getMonth());
  const [calendarYear, setCalendarYear] = useState(selectedDate.getFullYear());
  const [dateSlideDir, setDateSlideDir] = useState<'left' | 'right' | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const triggerDateSlide = useCallback((direction: 'left' | 'right') => {
    setDateSlideDir(direction);
    // Duration must match --animate-slide-in-left / --animate-slide-in-right in globals.css
    setTimeout(() => setDateSlideDir(null), 250);
  }, []);

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    
    if (isCalendarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isCalendarOpen]);

  // Reset calendar view to selected date when opening
  const handleOpenCalendar = () => {
    setCalendarMonth(selectedDate.getMonth());
    setCalendarYear(selectedDate.getFullYear());
    setIsCalendarOpen(true);
  };

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    triggerDateSlide('left');
    onDateChange(newDate);
  };

  const goToNextDay = () => {
    if (!isToday(selectedDate)) {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() + 1);
      triggerDateSlide('right');
      onDateChange(newDate);
    }
  };

  const handleDayClick = (day: number) => {
    const newDate = new Date(calendarYear, calendarMonth, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Don't allow future dates
    if (newDate > today) return;
    
    onDateChange(newDate);
    setIsCalendarOpen(false);
  };

  const goToPreviousMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const goToNextMonth = () => {
    const today = new Date();
    const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
    const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
    
    // Don't allow navigating to future months
    if (nextYear > today.getFullYear() || 
        (nextYear === today.getFullYear() && nextMonth > today.getMonth())) {
      return;
    }
    
    setCalendarMonth(nextMonth);
    setCalendarYear(nextYear);
  };

  // Check if next month navigation should be disabled
  const isNextMonthDisabled = () => {
    const today = new Date();
    const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
    const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
    return nextYear > today.getFullYear() || 
           (nextYear === today.getFullYear() && nextMonth > today.getMonth());
  };

  // Generate calendar days
  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const firstDayOfMonth = getFirstDayOfMonth(calendarYear, calendarMonth);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const calendarDays: (number | null)[] = [];
  // Add empty slots for days before the first day of the month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  // Add the days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div className="relative flex items-center justify-center gap-2">
      {/* Previous Day Button */}
      <button
        onClick={goToPreviousDay}
        className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center 
                   hover:bg-bg-surface transition-colors active:scale-95"
        aria-label="Previous day"
      >
        <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Date Display (clickable for calendar) */}
      <button
        onClick={() => isCalendarOpen ? setIsCalendarOpen(false) : handleOpenCalendar()}
        className="px-4 py-2 rounded-xl bg-bg-elevated hover:bg-bg-surface transition-colors
                   flex items-center gap-2 min-w-[140px] justify-center"
        aria-label="Open calendar"
      >
        <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span
          key={selectedDate.toISOString()}
          className={`text-body font-medium text-text-primary ${dateSlideDir === 'left' ? 'animate-slide-in-left' : dateSlideDir === 'right' ? 'animate-slide-in-right' : ''}`}
        >
          {formatDisplayDate(selectedDate)}
        </span>
      </button>

      {/* Next Day Button */}
      <button
        onClick={goToNextDay}
        disabled={isToday(selectedDate)}
        className={`w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center 
                   transition-colors active:scale-95
                   ${isToday(selectedDate) 
                     ? 'opacity-30 cursor-not-allowed' 
                     : 'hover:bg-bg-surface'}`}
        aria-label="Next day"
      >
        <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Calendar Dropdown */}
      {isCalendarOpen && (
        <div 
          ref={calendarRef}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-bg-surface border border-border-subtle 
                     rounded-xl shadow-xl p-4 animate-fade-in-up"
          style={{ minWidth: '280px' }}
        >
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goToPreviousMonth}
              className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center 
                         hover:bg-bg-primary transition-colors"
              aria-label="Previous month"
            >
              <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <span className="text-body font-semibold text-text-primary">
              {monthNames[calendarMonth]} {calendarYear}
            </span>
            
            <button
              onClick={goToNextMonth}
              disabled={isNextMonthDisabled()}
              className={`w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center 
                         transition-colors
                         ${isNextMonthDisabled() 
                           ? 'opacity-30 cursor-not-allowed' 
                           : 'hover:bg-bg-primary'}`}
              aria-label="Next month"
            >
              <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day Names Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map((name) => (
              <div key={name} className="text-center text-caption text-text-muted py-1">
                {name}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="w-9 h-9" />;
              }

              const dayDate = new Date(calendarYear, calendarMonth, day);
              dayDate.setHours(0, 0, 0, 0);
              const isFuture = dayDate > today;
              const isSelected = 
                day === selectedDate.getDate() && 
                calendarMonth === selectedDate.getMonth() && 
                calendarYear === selectedDate.getFullYear();
              const isCurrentDay = 
                day === today.getDate() && 
                calendarMonth === today.getMonth() && 
                calendarYear === today.getFullYear();

              // Get status for this day
              const dayDateKey = formatDateKey(dayDate);
              const dayStatus = dayStatuses?.get(dayDateKey);

              return (
                <div key={day} className="flex flex-col items-center">
                  <button
                    onClick={() => handleDayClick(day)}
                    disabled={isFuture}
                    className={`w-9 h-9 rounded-full text-sm font-medium transition-colors
                      ${isFuture
                        ? 'text-text-muted opacity-30 cursor-not-allowed'
                        : 'hover:bg-bg-elevated cursor-pointer'}
                      ${isSelected
                        ? 'bg-macro-calories text-white hover:bg-macro-calories'
                        : ''}
                      ${isCurrentDay && !isSelected
                        ? 'border border-macro-calories text-macro-calories'
                        : 'text-text-primary'}`}
                  >
                    {day}
                  </button>
                  {/* Status indicator dot */}
                  {!isFuture && dayStatus && (
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-0.5"
                      style={{ backgroundColor: STATUS_DOT_COLORS[dayStatus] }}
                      title={`Day ${dayStatus}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Today Button */}
          <button
            onClick={() => {
              onDateChange(new Date());
              setIsCalendarOpen(false);
            }}
            className="w-full mt-4 py-2 text-center text-caption text-macro-calories 
                       hover:underline font-medium"
          >
            Go to Today
          </button>
        </div>
      )}
    </div>
  );
}
