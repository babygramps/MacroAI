'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

const client = generateClient<Schema>();

interface Step {
  emoji: string;
  title: string;
  subtitle: string;
  field: 'calorieGoal' | 'proteinGoal' | 'carbsGoal' | 'fatGoal';
  unit: string;
  defaultValue: number;
  presets: number[];
  step: number;
}

const STEPS: Step[] = [
  {
    emoji: '🔥',
    title: "What's your daily calorie target?",
    subtitle: 'This is your total daily energy goal',
    field: 'calorieGoal',
    unit: 'kcal',
    defaultValue: 2000,
    presets: [1500, 2000, 2500],
    step: 50,
  },
  {
    emoji: '💪',
    title: 'How much protein?',
    subtitle: 'Protein helps build and repair muscle',
    field: 'proteinGoal',
    unit: 'grams',
    defaultValue: 150,
    presets: [100, 150, 200],
    step: 5,
  },
  {
    emoji: '🍞',
    title: 'Daily carbohydrates?',
    subtitle: 'Carbs are your main energy source',
    field: 'carbsGoal',
    unit: 'grams',
    defaultValue: 200,
    presets: [150, 200, 250],
    step: 10,
  },
  {
    emoji: '🥑',
    title: 'Daily fat intake?',
    subtitle: 'Healthy fats support hormone production',
    field: 'fatGoal',
    unit: 'grams',
    defaultValue: 65,
    presets: [50, 65, 80],
    step: 5,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState({
    calorieGoal: 2000,
    proteinGoal: 150,
    carbsGoal: 200,
    fatGoal: 65,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [existingProfileId, setExistingProfileId] = useState<string | null>(null);

  // Check for existing profile
  useEffect(() => {
    async function checkProfile() {
      try {
        const { data: profiles } = await client.models.UserProfile.list();
        if (profiles && profiles.length > 0) {
          const profile = profiles[0];
          setExistingProfileId(profile.id);
          setValues({
            calorieGoal: profile.calorieGoal ?? 2000,
            proteinGoal: profile.proteinGoal ?? 150,
            carbsGoal: profile.carbsGoal ?? 200,
            fatGoal: profile.fatGoal ?? 65,
          });
        }
      } catch (error) {
        console.error('Error checking profile:', error);
      }
    }
    checkProfile();
  }, []);

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  const handleValueChange = (delta: number) => {
    setValues((prev) => ({
      ...prev,
      [step.field]: Math.max(0, prev[step.field] + delta),
    }));
  };

  const handlePresetClick = (value: number) => {
    setValues((prev) => ({
      ...prev,
      [step.field]: value,
    }));
  };

  const handleNext = async () => {
    if (isLastStep) {
      setIsSaving(true);
      try {
        if (existingProfileId) {
          // Update existing profile
          await client.models.UserProfile.update({
            id: existingProfileId,
            ...values,
          });
        } else {
          // Create new profile
          await client.models.UserProfile.create(values);
        }
        router.push('/');
      } catch (error) {
        console.error('Error saving profile:', error);
        setIsSaving(false);
      }
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Progress dots */}
      <div className="flex gap-2 justify-center py-6">
        {STEPS.map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === currentStep
                ? 'w-8 bg-macro-calories'
                : index < currentStep
                  ? 'w-2 bg-macro-calories/50'
                  : 'w-2 bg-bg-elevated'
            }`}
          />
        ))}
      </div>

      {/* Back button */}
      {currentStep > 0 && (
        <button
          onClick={handleBack}
          className="absolute top-6 left-4 w-10 h-10 rounded-full bg-bg-elevated 
                     flex items-center justify-center hover:bg-bg-surface transition-colors"
          aria-label="Go back"
        >
          <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-32">
        {/* Emoji */}
        <div className="text-6xl mb-6 animate-fade-in-up">{step.emoji}</div>

        {/* Title */}
        <h1 className="text-page-title text-center mb-2 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {step.title}
        </h1>

        {/* Subtitle */}
        <p className="text-body text-text-secondary text-center mb-8 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          {step.subtitle}
        </p>

        {/* Value input */}
        <div className="bg-bg-surface rounded-2xl p-6 mb-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="text-center">
            <span className="text-[48px] font-mono font-bold text-text-primary min-w-[150px] inline-block">
              {values[step.field]}
            </span>
            <span className="text-body text-text-muted ml-2">{step.unit}</span>
          </div>
        </div>

        {/* Stepper buttons */}
        <div className="flex gap-4 mb-6 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <button
            onClick={() => handleValueChange(-step.step)}
            className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center 
                       hover:bg-bg-surface active:scale-95 transition-all"
            aria-label="Decrease"
          >
            <svg className="w-6 h-6 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={() => handleValueChange(step.step)}
            className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center 
                       hover:bg-bg-surface active:scale-95 transition-all"
            aria-label="Increase"
          >
            <svg className="w-6 h-6 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          {step.presets.map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              className={`px-4 py-2 rounded-full transition-colors ${
                values[step.field] === preset
                  ? 'bg-macro-calories text-white'
                  : 'bg-bg-elevated text-text-secondary hover:bg-bg-surface'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Next button */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-bg-primary via-bg-primary to-transparent">
        <button
          onClick={handleNext}
          disabled={isSaving}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              {isLastStep ? 'Finish Setup' : 'Next'}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
