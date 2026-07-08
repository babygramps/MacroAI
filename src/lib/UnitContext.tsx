'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { UnitSystem } from './types';
import { getWeightUnit, getHeightUnit } from './unitConversions';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';

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

  // Stable across renders (only reads/writes state setters + the module-level
  // Amplify client accessor) so it can safely be a dependency of the
  // callbacks/memo below without ever forcing them to change identity.
  const fetchUnitPreference = useCallback(async () => {
    try {
      const client = getAmplifyDataClient();
      if (!client) {
        setIsLoading(false);
        return;
      }
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
  }, []);

  useEffect(() => {
    fetchUnitPreference();
  }, [fetchUnitPreference]);

  // Reads `profileId` from closure, so it must be recreated whenever that
  // changes — omitting it would let this silently save against a stale
  // profile.
  const setUnitSystem = useCallback(async (system: UnitSystem) => {
    setUnitSystemState(system);

    if (profileId) {
      try {
        const client = getAmplifyDataClient();
        if (!client) {
          return;
        }
        await client.models.UserProfile.update({
          id: profileId,
          preferredUnitSystem: system,
          preferredWeightUnit: getWeightUnit(system),
        });
      } catch (error) {
        console.error('[UnitContext] Error saving unit preference:', error);
      }
    }
  }, [profileId]);

  const refreshUnits = useCallback(async () => {
    setIsLoading(true);
    await fetchUnitPreference();
  }, [fetchUnitPreference]);

  // Memoized so consumers of useUnits() only re-render when one of these
  // values actually changes, instead of on every UnitProvider render.
  const value: UnitContextValue = useMemo(() => ({
    unitSystem,
    weightUnit: getWeightUnit(unitSystem),
    heightUnit: getHeightUnit(unitSystem),
    isLoading,
    setUnitSystem,
    refreshUnits,
  }), [unitSystem, isLoading, setUnitSystem, refreshUnits]);

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
