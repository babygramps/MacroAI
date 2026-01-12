'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { SearchTab } from './SearchTab';
import { TextTab } from './TextTab';
import { PhotoTab } from './PhotoTab';

interface FoodLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = 'search' | 'type' | 'photo';

// SSR-safe way to check if mounted (React 19 compatible)
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function FoodLogModal({ isOpen, onClose, onSuccess }: FoodLogModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  const tabs = [
    { id: 'search' as Tab, label: 'Search', icon: '🔍' },
    { id: 'type' as Tab, label: 'Type', icon: '✏️' },
    { id: 'photo' as Tab, label: 'Photo', icon: '📷' },
  ];

  const modalContent = (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="absolute inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 
                      sm:max-w-md sm:w-full sm:max-h-[90vh] sm:rounded-2xl
                      bg-bg-primary flex flex-col animate-slide-up">
        {/* Header */}
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

        {/* Tab bar */}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'search' && <SearchTab onSuccess={onSuccess} />}
          {activeTab === 'type' && <TextTab onSuccess={onSuccess} />}
          {activeTab === 'photo' && <PhotoTab onSuccess={onSuccess} />}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
