'use client';

import { useState, useEffect, useRef } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { lbsToKg, kgToLbs } from '@/lib/statsHelpers';

const client = generateClient<Schema>();

interface WeightLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preferredUnit?: 'kg' | 'lbs';
}

// Inner form component that resets when key changes
function WeightLogForm({ 
  onClose, 
  onSuccess, 
  preferredUnit,
}: { 
  onClose: () => void; 
  onSuccess: () => void; 
  preferredUnit: 'kg' | 'lbs';
}) {
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(preferredUnit);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Log on mount only (not on every state change)
  useEffect(() => {
    console.log('[WeightLogForm] Mounted with preferredUnit:', preferredUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum <= 0) {
      setError('Please enter a valid weight');
      return;
    }

    // Convert to kg if needed
    const weightKg = unit === 'lbs' ? lbsToKg(weightNum) : weightNum;

    console.log('[WeightLogModal] Weight conversion:', {
      inputValue: weight,
      inputUnit: unit,
      preferredUnit,
      weightNum,
      convertedWeightKg: weightKg,
      willConvert: unit === 'lbs',
    });

    // Validate reasonable weight range (20kg - 500kg)
    if (weightKg < 20 || weightKg > 500) {
      setError('Please enter a weight between 20-500 kg (44-1100 lbs)');
      return;
    }

    setIsSaving(true);
    console.log('[WeightLogModal] Saving weight:', { weightKg, date, note });

    try {
      // Create datetime for the selected date at noon (to avoid timezone issues)
      const recordedAt = new Date(`${date}T12:00:00`).toISOString();

      await client.models.WeightLog.create({
        weightKg,
        recordedAt,
        note: note.trim() || undefined,
      });

      console.log('[WeightLogModal] Weight saved successfully');
      onSuccess();
    } catch (err) {
      console.error('[WeightLogModal] Error saving weight:', err);
      setError('Failed to save weight. Please try again.');
      setIsSaving(false);
    }
  };

  const handleUnitToggle = () => {
    const newUnit = unit === 'kg' ? 'lbs' : 'kg';
    
    // Convert the current weight value if there is one
    if (weight) {
      const currentWeight = parseFloat(weight);
      if (!isNaN(currentWeight)) {
        if (newUnit === 'lbs') {
          setWeight(kgToLbs(currentWeight).toString());
        } else {
          setWeight(lbsToKg(currentWeight).toString());
        }
      }
    }
    
    setUnit(newUnit);
  };

  // Quick weight buttons based on unit
  const quickWeights = unit === 'kg' 
    ? [60, 70, 80, 90, 100]
    : [130, 155, 175, 200, 220];

  return (
    <form onSubmit={handleSubmit} className="p-6">
      {/* Weight input with unit toggle */}
      <div className="mb-4">
        <label className="text-caption block mb-2">Weight</label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="number"
              step="0.1"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={unit === 'kg' ? '70.0' : '154.0'}
              className="input-field text-2xl font-mono pr-14 text-center"
              required
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted font-mono">
              {unit}
            </span>
          </div>
          <button
            type="button"
            onClick={handleUnitToggle}
            className="btn-secondary px-4 flex items-center gap-1"
            aria-label={`Switch to ${unit === 'kg' ? 'pounds' : 'kilograms'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            {unit === 'kg' ? 'lbs' : 'kg'}
          </button>
        </div>
      </div>

      {/* Quick weight buttons */}
      <div className="mb-4">
        <div className="flex gap-2 flex-wrap">
          {quickWeights.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeight(w.toString())}
              className={`preset-button ${weight === w.toString() ? 'bg-weight text-white' : ''}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Date input */}
      <div className="mb-4">
        <label className="text-caption block mb-2">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="input-field"
        />
      </div>

      {/* Note input */}
      <div className="mb-6">
        <label className="text-caption block mb-2">Note (optional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g., After workout, Morning weigh-in"
          className="input-field"
          maxLength={100}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary flex-1"
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || !weight}
          className="btn-weight flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="spinner" />
              Saving...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Weight
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export function WeightLogModal({ isOpen, onClose, onSuccess, preferredUnit = 'kg' }: WeightLogModalProps) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Return null when closed - this ensures form state resets when reopened
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-bg-surface rounded-t-2xl sm:rounded-2xl 
                   animate-slide-up shadow-xl border border-border-subtle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weight-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 id="weight-modal-title" className="text-section-title">Log Weight</h2>
          <button
            onClick={onClose}
            className="icon-button-sm"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form - key ensures it remounts when preferredUnit changes */}
        <WeightLogForm
          key={preferredUnit}
          onClose={onClose}
          onSuccess={onSuccess}
          preferredUnit={preferredUnit}
        />
      </div>
    </div>
  );
}
