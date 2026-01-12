'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

const client = generateClient<Schema>();

interface BaseStep {
  emoji: string;
  title: string;
  subtitle: string;
  field: string;
  optional?: boolean;
}

interface NumberStep extends BaseStep {
  type: 'number';
  unit: string;
  defaultValue: number;
  presets: number[];
  step: number;
  min?: number;
  max?: number;
}

interface SelectStep extends BaseStep {
  type: 'select';
  options: { value: string; label: string; emoji?: string }[];
  defaultValue: string;
}

interface DateStep extends BaseStep {
  type: 'date';
  defaultValue: string;
}

interface ToggleStep extends BaseStep {
  type: 'toggle';
  defaultValue: boolean;
  description: string;
}

type Step = NumberStep | SelectStep | DateStep | ToggleStep;

const STEPS: Step[] = [
  // Profile Setup
  {
    emoji: '📏',
    title: "What's your height?",
    subtitle: 'Used for accurate metabolic calculations',
    field: 'heightCm',
    type: 'number',
    unit: 'cm',
    defaultValue: 170,
    presets: [160, 170, 180],
    step: 1,
    min: 100,
    max: 250,
  },
  {
    emoji: '⚧️',
    title: 'Biological sex?',
    subtitle: 'Affects your basal metabolic rate calculation',
    field: 'sex',
    type: 'select',
    options: [
      { value: 'male', label: 'Male', emoji: '♂️' },
      { value: 'female', label: 'Female', emoji: '♀️' },
    ],
    defaultValue: 'male',
  },
  {
    emoji: '🎂',
    title: 'When were you born?',
    subtitle: 'Age impacts your metabolism',
    field: 'birthDate',
    type: 'date',
    defaultValue: '1990-01-01',
  },
  // Goal Setup
  {
    emoji: '🎯',
    title: "What's your goal?",
    subtitle: 'This determines your calorie adjustments',
    field: 'goalType',
    type: 'select',
    options: [
      { value: 'lose', label: 'Lose Weight', emoji: '📉' },
      { value: 'maintain', label: 'Maintain Weight', emoji: '⚖️' },
      { value: 'gain', label: 'Build Muscle', emoji: '💪' },
    ],
    defaultValue: 'maintain',
  },
  {
    emoji: '⏱️',
    title: 'How fast?',
    subtitle: 'Weekly weight change target',
    field: 'goalRate',
    type: 'number',
    unit: 'kg/week',
    defaultValue: 0.5,
    presets: [0.25, 0.5, 0.75],
    step: 0.05,
    min: 0.1,
    max: 1.0,
  },
  {
    emoji: '🏋️',
    title: 'Are you an athlete?',
    subtitle: 'Training 7+ hours/week? Athletes have higher metabolism',
    field: 'athleteStatus',
    type: 'toggle',
    defaultValue: false,
    description: 'I train intensely 7+ hours per week',
  },
  // Macro Goals
  {
    emoji: '🔥',
    title: "What's your daily calorie target?",
    subtitle: 'This will be refined based on your actual TDEE',
    field: 'calorieGoal',
    type: 'number',
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
    type: 'number',
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
    type: 'number',
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
    type: 'number',
    unit: 'grams',
    defaultValue: 65,
    presets: [50, 65, 80],
    step: 5,
  },
];

interface FormValues {
  heightCm: number;
  sex: string;
  birthDate: string;
  goalType: string;
  goalRate: number;
  athleteStatus: boolean;
  calorieGoal: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  [key: string]: number | string | boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [values, setValues] = useState<FormValues>({
    heightCm: 170,
    sex: 'male',
    birthDate: '1990-01-01',
    goalType: 'maintain',
    goalRate: 0.5,
    athleteStatus: false,
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
            heightCm: profile.heightCm ?? 170,
            sex: profile.sex ?? 'male',
            birthDate: profile.birthDate ?? '1990-01-01',
            goalType: profile.goalType ?? 'maintain',
            goalRate: profile.goalRate ?? 0.5,
            athleteStatus: profile.athleteStatus ?? false,
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

  // Skip goal rate step if maintaining
  const shouldSkipStep = (stepIndex: number): boolean => {
    const stepDef = STEPS[stepIndex];
    if (stepDef.field === 'goalRate' && values.goalType === 'maintain') {
      return true;
    }
    return false;
  };

  const handleValueChange = (delta: number) => {
    if (step.type !== 'number') return;
    const numStep = step as NumberStep;
    setValues((prev) => {
      const newValue = (prev[step.field] as number) + delta;
      const min = numStep.min ?? 0;
      const max = numStep.max ?? Infinity;
      return {
        ...prev,
        [step.field]: Math.max(min, Math.min(max, newValue)),
      };
    });
  };

  const handlePresetClick = (value: number) => {
    setValues((prev) => ({
      ...prev,
      [step.field]: value,
    }));
  };

  const handleSelectChange = (value: string) => {
    setValues((prev) => ({
      ...prev,
      [step.field]: value,
    }));
  };

  const handleDateChange = (value: string) => {
    setValues((prev) => ({
      ...prev,
      [step.field]: value,
    }));
  };

  const handleToggleChange = () => {
    setValues((prev) => ({
      ...prev,
      [step.field]: !prev[step.field],
    }));
  };

  const handleNext = async () => {
    if (isLastStep) {
      setIsSaving(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const profileData = {
          ...values,
          startDate: existingProfileId ? undefined : today,
          expenditureStrategy: 'dynamic',
        };
        
        if (existingProfileId) {
          // Update existing profile
          await client.models.UserProfile.update({
            id: existingProfileId,
            ...profileData,
          });
        } else {
          // Create new profile
          await client.models.UserProfile.create({
            ...profileData,
            startDate: today,
          });
        }
        router.push('/');
      } catch (error) {
        console.error('Error saving profile:', error);
        setIsSaving(false);
      }
    } else {
      // Find next valid step (skip if necessary)
      let nextStep = currentStep + 1;
      while (nextStep < STEPS.length && shouldSkipStep(nextStep)) {
        nextStep++;
      }
      setCurrentStep(nextStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      // Find previous valid step
      let prevStep = currentStep - 1;
      while (prevStep >= 0 && shouldSkipStep(prevStep)) {
        prevStep--;
      }
      if (prevStep >= 0) {
        setCurrentStep(prevStep);
      }
    }
  };

  // Render different input types
  const renderInput = () => {
    switch (step.type) {
      case 'number': {
        const numStep = step as NumberStep;
        const value = values[step.field] as number;
        const displayValue = numStep.step < 1 
          ? value.toFixed(2) 
          : value.toString();
        
        return (
          <>
            {/* Value input */}
            <div className="bg-bg-surface rounded-2xl p-6 mb-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="text-center">
                <span className="text-[48px] font-mono font-bold text-text-primary min-w-[150px] inline-block">
                  {displayValue}
                </span>
                <span className="text-body text-text-muted ml-2">{numStep.unit}</span>
              </div>
            </div>

            {/* Stepper buttons */}
            <div className="flex gap-4 mb-6 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
              <button
                onClick={() => handleValueChange(-numStep.step)}
                className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center 
                           hover:bg-bg-surface active:scale-95 transition-all"
                aria-label="Decrease"
              >
                <svg className="w-6 h-6 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <button
                onClick={() => handleValueChange(numStep.step)}
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
              {numStep.presets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetClick(preset)}
                  className={`px-4 py-2 rounded-full transition-colors ${
                    value === preset
                      ? 'bg-macro-calories text-white'
                      : 'bg-bg-elevated text-text-secondary hover:bg-bg-surface'
                  }`}
                >
                  {numStep.step < 1 ? preset.toFixed(2) : preset}
                </button>
              ))}
            </div>
          </>
        );
      }

      case 'select': {
        const selectStep = step as SelectStep;
        const value = values[step.field] as string;
        
        return (
          <div className="flex flex-col gap-3 w-full max-w-sm animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            {selectStep.options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelectChange(option.value)}
                className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
                  value === option.value
                    ? 'bg-macro-calories text-white ring-2 ring-macro-calories ring-offset-2 ring-offset-bg-primary'
                    : 'bg-bg-surface text-text-primary hover:bg-bg-elevated'
                }`}
              >
                {option.emoji && <span className="text-2xl">{option.emoji}</span>}
                <span className="text-lg font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        );
      }

      case 'date': {
        const value = values[step.field] as string;
        
        return (
          <div className="w-full max-w-sm animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <input
              type="date"
              value={value}
              onChange={(e) => handleDateChange(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              min="1920-01-01"
              className="input-field text-xl text-center w-full"
            />
            <p className="text-caption text-text-muted text-center mt-3">
              {value && `Age: ${calculateAge(value)} years old`}
            </p>
          </div>
        );
      }

      case 'toggle': {
        const toggleStep = step as ToggleStep;
        const value = values[step.field] as boolean;
        
        return (
          <div className="w-full max-w-sm animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <button
              onClick={handleToggleChange}
              className={`w-full p-6 rounded-xl transition-all ${
                value
                  ? 'bg-macro-calories text-white ring-2 ring-macro-calories ring-offset-2 ring-offset-bg-primary'
                  : 'bg-bg-surface text-text-primary hover:bg-bg-elevated'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-medium">{toggleStep.description}</span>
                <div className={`w-12 h-7 rounded-full p-1 transition-colors ${
                  value ? 'bg-white/30' : 'bg-bg-elevated'
                }`}>
                  <div className={`w-5 h-5 rounded-full transition-all ${
                    value ? 'bg-white ml-5' : 'bg-text-muted ml-0'
                  }`} />
                </div>
              </div>
            </button>
            <p className="text-caption text-text-muted text-center mt-3">
              {value 
                ? 'Your TDEE estimate will be increased by ~10%' 
                : 'Standard metabolic rate calculation'}
            </p>
          </div>
        );
      }
    }
  };

  // Calculate visible step count (excluding skipped steps)
  const getVisibleStepCount = () => {
    return STEPS.filter((_, i) => !shouldSkipStep(i)).length;
  };

  const getVisibleStepIndex = () => {
    let visibleIndex = 0;
    for (let i = 0; i < currentStep; i++) {
      if (!shouldSkipStep(i)) {
        visibleIndex++;
      }
    }
    return visibleIndex;
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Progress dots */}
      <div className="flex gap-2 justify-center py-6">
        {Array.from({ length: getVisibleStepCount() }).map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === getVisibleStepIndex()
                ? 'w-8 bg-macro-calories'
                : index < getVisibleStepIndex()
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

      {/* Skip to Dashboard (for returning users) */}
      {existingProfileId && (
        <button
          onClick={() => router.push('/')}
          className="absolute top-6 right-4 px-3 py-1.5 rounded-full bg-bg-elevated 
                     text-sm text-text-secondary hover:bg-bg-surface transition-colors"
        >
          Skip
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

        {/* Dynamic input based on step type */}
        {renderInput()}
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
              {isLastStep ? 'Start Tracking' : 'Next'}
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

// Helper function to calculate age
function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}
