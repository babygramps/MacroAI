'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ModalShell } from './ui/ModalShell';

interface FoodLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = 'recents' | 'search' | 'type' | 'photo';

export function FoodLogModal({ isOpen, onClose, onSuccess }: FoodLogModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('recents');

  // Lazy load tabs with next/dynamic (bundle-dynamic-imports rule)
  const RecentsTab = useMemo(
    () =>
      dynamic(() => import('./RecentsTab').then((mod) => mod.RecentsTab), {
        ssr: false,
        loading: () => <div className="p-4 text-text-secondary">Loading recents…</div>,
      }),
    []
  );
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

  const tabs = [
    { id: 'recents' as Tab, label: 'Recents', icon: '⏱️' },
    { id: 'search' as Tab, label: 'Search', icon: '🔍' },
    { id: 'type' as Tab, label: 'Type', icon: '✏️' },
    { id: 'photo' as Tab, label: 'Photo', icon: '📷' },
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
            onClick={() => setActiveTab(tab.id)}
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

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'recents' && <RecentsTab onSuccess={onSuccess} />}
        {activeTab === 'search' && <SearchTab onSuccess={onSuccess} />}
        {activeTab === 'type' && <TextTab onSuccess={onSuccess} />}
        {activeTab === 'photo' && <PhotoTab onSuccess={onSuccess} />}
      </div>
    </ModalShell>
  );
}
