'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ModalShell } from './ui/ModalShell';
import type { RecentFoodsResponse, MealEntry } from '@/lib/types';

interface FoodLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (options?: { verified?: boolean; meal?: MealEntry }) => void;
  prefetchedRecents?: RecentFoodsResponse | null;
}

type Tab = 'search' | 'type' | 'photo' | 'recipe';

const TAB_ORDER: Tab[] = ['search', 'type', 'photo', 'recipe'];

export function FoodLogModal({ isOpen, onClose, onSuccess, prefetchedRecents }: FoodLogModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [isSaving, setIsSaving] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const prevTabRef = useRef<Tab>('search');

  const handleTabChange = useCallback((newTab: Tab) => {
    const oldIndex = TAB_ORDER.indexOf(prevTabRef.current);
    const newIndex = TAB_ORDER.indexOf(newTab);
    setSlideDirection(newIndex > oldIndex ? 'right' : 'left');
    prevTabRef.current = newTab;
    setActiveTab(newTab);
    // Clear direction after animation completes
    setTimeout(() => setSlideDirection(null), 250);
  }, []);

  // Wrap onSuccess to show saving overlay while dashboard refreshes
  const handleSuccess = useCallback(async (options?: { verified?: boolean; meal?: MealEntry }) => {
    setIsSaving(true);
    try {
      await onSuccess(options);
    } finally {
      setIsSaving(false);
    }
  }, [onSuccess]);

  // Lazy load tabs with next/dynamic (bundle-dynamic-imports rule)
  const SearchTab = useMemo(
    () =>
      dynamic(() => import('./SearchTab').then((mod) => mod.SearchTab), {
        ssr: false,
        loading: () => <div className="p-4 text-text-secondary">Loading search…</div>,
      }),
    []
  );
  const TextTab = useMemo(
    () =>
      dynamic(() => import('./TextTab').then((mod) => mod.TextTab), {
        ssr: false,
        loading: () => <div className="p-4 text-text-secondary">Loading input…</div>,
      }),
    []
  );
  const PhotoTab = useMemo(
    () =>
      dynamic(() => import('./PhotoTab').then((mod) => mod.PhotoTab), {
        ssr: false,
        loading: () => <div className="p-4 text-text-secondary">Loading camera…</div>,
      }),
    []
  );
  const RecipeTab = useMemo(
    () =>
      dynamic(() => import('./RecipeTab').then((mod) => mod.RecipeTab), {
        ssr: false,
        loading: () => <div className="p-4 text-text-secondary">Loading recipes…</div>,
      }),
    []
  );

  const tabs = [
    { id: 'search' as Tab, label: 'Search', icon: '🔍' },
    { id: 'type' as Tab, label: 'Type', icon: '✏️' },
    { id: 'photo' as Tab, label: 'Photo', icon: '📷' },
    { id: 'recipe' as Tab, label: 'Recipe', icon: '📖' },
  ];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="absolute inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 
                      sm:max-w-md sm:w-full sm:max-h-[90vh] sm:rounded-2xl
                      bg-bg-primary flex flex-col animate-slide-up"
    >
      <div className="modal-header">
        <button
          onClick={onClose}
          className="icon-button -ml-2"
          aria-label="Close"
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-card-title flex-1 text-center mr-8">Log Food</h2>
      </div>

      <div className="flex border-b border-border-subtle shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          >
            <span className="mr-1">{tab.icon}</span>
            <span className="text-sm font-medium">{tab.label}</span>
            {activeTab === tab.id && (
              <div className="tab-button-indicator" />
            )}
          </button>
        ))}
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={slideDirection ? { animation: `slide-in-${slideDirection === 'right' ? 'right' : 'left'} 0.25s ease-out` } : undefined}
        key={activeTab}
      >
        {activeTab === 'search' && <SearchTab onSuccess={handleSuccess} prefetchedRecents={prefetchedRecents} />}
        {activeTab === 'type' && <TextTab onSuccess={handleSuccess} />}
        {activeTab === 'photo' && <PhotoTab onSuccess={handleSuccess} />}
        {activeTab === 'recipe' && <RecipeTab onSuccess={handleSuccess} />}
      </div>

      {/* Saving overlay */}
      {isSaving && (
        <div className="absolute inset-0 bg-bg-primary/90 flex flex-col items-center justify-center z-50 animate-fade-in">
          <div className="spinner w-8 h-8 mb-4" />
          <p className="text-lg font-medium text-text-primary">Saving...</p>
          <p className="text-sm text-text-secondary mt-1">Syncing with database</p>
        </div>
      )}
    </ModalShell>
  );
}
