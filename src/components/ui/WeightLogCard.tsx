'use client';

import { useState } from 'react';
import type { WeightLogEntry } from '@/lib/types';
import { kgToLbs, lbsToKg, formatWeight } from '@/lib/statsHelpers';

interface WeightLogCardProps {
  entry: WeightLogEntry;
  preferredUnit: 'kg' | 'lbs';
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: { weightKg: number; note?: string }) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const entryDate = new Date(date);
  entryDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function WeightLogCard({ entry, preferredUnit, onDelete, onUpdate }: WeightLogCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editWeight, setEditWeight] = useState('');
  const [editNote, setEditNote] = useState('');

  const displayWeight = preferredUnit === 'lbs' 
    ? kgToLbs(entry.weightKg) 
    : Math.round(entry.weightKg * 10) / 10;

  const handleStartEdit = () => {
    setEditWeight(displayWeight.toString());
    setEditNote(entry.note || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!onUpdate) return;
    
    const weightNum = parseFloat(editWeight);
    if (isNaN(weightNum) || weightNum <= 0) return;
    
    // Convert to kg if needed
    const weightKg = preferredUnit === 'lbs' ? lbsToKg(weightNum) : weightNum;
    
    setIsSaving(true);
    try {
      await onUpdate(entry.id, {
        weightKg,
        note: editNote.trim() || undefined,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Quick weight buttons based on unit
  const quickWeights = preferredUnit === 'kg' 
    ? [60, 70, 80, 90, 100]
    : [130, 155, 175, 200, 220];

  // Editing mode
  if (isEditing) {
    return (
      <div className="card p-4 bg-bg-surface border-weight/30">
        {/* Weight input */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              step="0.1"
              value={editWeight}
              onChange={(e) => setEditWeight(e.target.value)}
              className="flex-1 bg-bg-elevated rounded-lg px-3 py-2 text-text-primary text-center
                         font-mono text-lg focus:outline-none focus:ring-2 focus:ring-weight/50"
              autoFocus
            />
            <span className="text-text-muted font-mono">{preferredUnit}</span>
          </div>
          {/* Quick weight buttons */}
          <div className="flex gap-1 flex-wrap">
            {quickWeights.map((w) => (
              <button
                key={w}
                onClick={() => setEditWeight(w.toString())}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  editWeight === w.toString() 
                    ? 'bg-weight text-white' 
                    : 'bg-bg-elevated text-text-secondary hover:bg-bg-primary'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* Note input */}
        <div className="mb-3">
          <input
            type="text"
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full bg-bg-elevated rounded-lg px-3 py-2 text-text-primary text-sm
                       focus:outline-none focus:ring-2 focus:ring-weight/50"
            maxLength={100}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="flex-1 py-2 rounded-lg bg-bg-elevated text-text-secondary 
                       hover:bg-bg-primary transition-colors disabled:opacity-50 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !editWeight}
            className="flex-1 py-2 rounded-lg bg-weight text-white font-medium
                       hover:bg-weight/80 transition-colors disabled:opacity-50 text-sm
                       flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="spinner" style={{ width: '0.875rem', height: '0.875rem' }} />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Normal display mode
  return (
    <div className="card-interactive flex items-center gap-3 py-3 px-4">
      {/* Scale icon */}
      <div className="w-8 h-8 rounded-full bg-weight-subtle flex items-center justify-center flex-shrink-0">
        <svg 
          className="w-4 h-4 text-weight" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" 
          />
        </svg>
      </div>
      
      {/* Weight info */}
      <div className="flex-1 min-w-0">
        <p className="font-mono font-bold text-weight">
          {formatWeight(entry.weightKg, preferredUnit)}
        </p>
        <p className="text-caption text-text-muted truncate">
          {formatDate(entry.recordedAt)}
          {entry.note && ` • ${entry.note}`}
        </p>
      </div>
      
      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Edit button */}
        {onUpdate && (
          <button
            onClick={handleStartEdit}
            className="icon-button-sm hover:bg-weight/20"
            aria-label="Edit weight"
          >
            <svg
              className="w-4 h-4 text-text-muted hover:text-weight"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        )}
        
        {/* Delete button */}
        {onDelete && (
          <button
            onClick={() => onDelete(entry.id)}
            className="icon-button-sm hover:bg-red-500/20"
            aria-label="Delete weight"
          >
            <svg
              className="w-4 h-4 text-text-muted hover:text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// Skeleton for loading state
export function WeightLogCardSkeleton() {
  return (
    <div className="card-interactive flex items-center gap-3 py-3 px-4">
      <div className="w-8 h-8 rounded-full skeleton" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-5 w-20" />
        <div className="skeleton h-3 w-32" />
      </div>
    </div>
  );
}
