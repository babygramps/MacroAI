'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { UnitSystem } from './types';
import { getWeightUnit, getHeightUnit } from './unitConversions';

const client = generateClient<Schema>();

interface UnitContextValue {
  unitSystem: UnitSystem;
  weightUnit: 'kg' | 'lbs';
  heightUnit: 'cm' | 'ft';
  isLoading: boolean;
  setUnitSystem: (system: UnitSystem) => Promise<void>;
  refreshUnits: () => Promise<void>;
}

const UnitContext = createContext<UnitContextValue | null>(null);

interface UnitProviderProps {
  children: ReactNode;
}

export function UnitProvider({ children }: UnitProviderProps) {
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>('metric');
  const [isLoading, setIsLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);

  const fetchUnitPreference = async () => {
    try {
      const { data: profiles } = await client.models.UserProfile.list();
      if (profiles && profiles.length > 0) {
        const profile = profiles[0];
        setProfileId(profile.id);
        
        // Determine unit system from profile
        const savedSystem = (profile.preferredUnitSystem as UnitSystem) ?? 
          (profile.preferredWeightUnit === 'lbs' ? 'imperial' : 'metric');
        
        setUnitSystemState(savedSystem);
      }
    } catch (error) {
      console.error('[UnitContext] Error fetching unit preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUnitPreference();
  }, []);

  const setUnitSystem = async (system: UnitSystem) => {
    setUnitSystemState(system);
    
    if (profileId) {
      try {
        await client.models.UserProfile.update({
          id: profileId,
          preferredUnitSystem: system,
          preferredWeightUnit: getWeightUnit(system),
        });
        console.log('[UnitContext] Unit system updated to:', system);
      } catch (error) {
        console.error('[UnitContext] Error saving unit preference:', error);
      }
    }
  };

  const refreshUnits = async () => {
    setIsLoading(true);
    await fetchUnitPreference();
  };

  const value: UnitContextValue = {
    unitSystem,
    weightUnit: getWeightUnit(unitSystem),
    heightUnit: getHeightUnit(unitSystem),
    isLoading,
    setUnitSystem,
    refreshUnits,
  };

  return (
    <UnitContext.Provider value={value}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnits() {
  const context = useContext(UnitContext);
  if (!context) {
    throw new Error('useUnits must be used within a UnitProvider');
  }
  return context;
}

/**
 * Hook that returns unit system with a fallback for components
 * that may render before context is available
 */
export function useUnitsWithFallback(fallback: UnitSystem = 'metric') {
  const context = useContext(UnitContext);
  
  if (!context) {
    return {
      unitSystem: fallback,
      weightUnit: getWeightUnit(fallback),
      heightUnit: getHeightUnit(fallback),
      isLoading: false,
    };
  }
  
  return context;
}
