'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';
import type { UnitSystem } from '@/lib/types';
import {
  kgToLbs,
  lbsToKg,
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  getWeightUnit,
} from '@/lib/unitConversions';
import { showToast } from '@/components/ui/Toast';
import { AppHeader } from '@/components/ui/AppHeader';
import { BottomNav } from '@/components/ui/BottomNav';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import { EXPORT_SCOPES, exportUserData, type ExportScope } from '@/lib/export/exportData';
import { PasskeyManager } from '@/components/ui/PasskeyManager';

interface ProfileData {
  id: string;
  preferredUnitSystem: UnitSystem;
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
  targetWeightKg: number | null;
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

export default function SettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [exportScope, setExportScope] = useState<ExportScope>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  
  // Editing states
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string | number | boolean>('');
  
  // Height state for imperial
  const [heightFeet, setHeightFeet] = useState(5);
  const [heightInches, setHeightInches] = useState(7);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const client = getAmplifyDataClient();
      if (!client) {
        showToast('Amplify is not ready yet. Please try again.', 'error');
        setIsLoading(false);
        return;
      }
      const { data: profiles } = await client.models.UserProfile.list();
      if (profiles && profiles.length > 0) {
        const p = profiles[0];
        const unitSystem = (p.preferredUnitSystem as UnitSystem) ?? 
          (p.preferredWeightUnit === 'lbs' ? 'imperial' : 'metric');
        
        setProfile({
          id: p.id,
          preferredUnitSystem: unitSystem,
          heightCm: p.heightCm ?? 170,
          sex: p.sex ?? 'male',
          birthDate: p.birthDate ?? '1990-01-01',
          goalType: p.goalType ?? 'maintain',
          goalRate: p.goalRate ?? 0.5,
          athleteStatus: p.athleteStatus ?? false,
          calorieGoal: p.calorieGoal ?? 2000,
          proteinGoal: p.proteinGoal ?? 150,
          carbsGoal: p.carbsGoal ?? 200,
          fatGoal: p.fatGoal ?? 65,
          targetWeightKg: p.targetWeightKg ?? null,
        });

        // Set imperial height
        if (p.heightCm) {
          const { feet, inches } = cmToFeetInches(p.heightCm);
          setHeightFeet(feet);
          setHeightInches(inches);
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      showToast('Failed to load settings', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const saveField = async (field: string, value: unknown) => {
    if (!profile) return;
    
    setIsSaving(true);
    try {
      const client = getAmplifyDataClient();
      if (!client) {
        showToast('Amplify is not ready yet. Please try again.', 'error');
        setIsSaving(false);
        return;
      }
      await client.models.UserProfile.update({
        id: profile.id,
        [field]: value,
      });
      
      setProfile((prev) => prev ? { ...prev, [field]: value } : null);
      showToast('Setting saved', 'success');
      setEditingField(null);
    } catch (error) {
      console.error('Error saving:', error);
      showToast('Failed to save', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnitSystemChange = async (newSystem: UnitSystem) => {
    if (!profile) return;
    
    setIsSaving(true);
    try {
      const client = getAmplifyDataClient();
      if (!client) {
        showToast('Amplify is not ready yet. Please try again.', 'error');
        setIsSaving(false);
        return;
      }
      const weightUnit = getWeightUnit(newSystem);
      await client.models.UserProfile.update({
        id: profile.id,
        preferredUnitSystem: newSystem,
        preferredWeightUnit: weightUnit,
      });
      
      setProfile((prev) => prev ? { ...prev, preferredUnitSystem: newSystem } : null);
      showToast(`Switched to ${newSystem} units`, 'success');
    } catch (error) {
      console.error('Error saving unit system:', error);
      showToast('Failed to update units', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleHeightSave = async () => {
    if (!profile) return;
    
    let heightCm: number;
    if (profile.preferredUnitSystem === 'imperial') {
      heightCm = feetInchesToCm(heightFeet, heightInches);
    } else {
      heightCm = tempValue as number;
    }
    
    await saveField('heightCm', heightCm);
  };

  const handleGoalRateSave = async () => {
    if (!profile) return;
    
    let rateKg = tempValue as number;
    if (profile.preferredUnitSystem === 'imperial') {
      rateKg = lbsToKg(rateKg);
    }
    
    await saveField('goalRate', rateKg);
  };

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportStatus('Preparing export...');
    try {
      await exportUserData(exportScope, {
        onProgress: setExportStatus,
      });
      showToast('Export ready. Downloads started.', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setIsExporting(false);
      setExportStatus(null);
    }
  }, [exportScope]);


  if (isLoading) {
    return (
      <div className="page-container-compact">
        <AppHeader title="Settings" showBack showSettings={false} />
        <main className="content-wrapper py-6 space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="h-5 w-32 skeleton rounded mb-4" />
              <div className="space-y-3">
                <div className="h-12 skeleton rounded" />
                <div className="h-12 skeleton rounded" />
              </div>
            </div>
          ))}
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary mb-4">No profile found</p>
          <button onClick={() => router.push('/onboarding')} className="btn-primary">
            Complete Setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container-compact pb-8">
      <AppHeader title="Settings" showBack showSettings={false} />

      <main className="content-wrapper py-6 space-y-6">
        {/* Unit System */}
        <section className="card">
          <h2 className="text-card-title text-text-secondary mb-4">Units</h2>
          <div className="flex gap-3">
            <button
              onClick={() => handleUnitSystemChange('metric')}
              disabled={isSaving}
              className={`flex-1 p-4 rounded-xl transition-all ${
                profile.preferredUnitSystem === 'metric'
                  ? 'bg-macro-calories text-white ring-2 ring-macro-calories'
                  : 'bg-bg-elevated text-text-primary hover:bg-bg-surface'
              }`}
            >
              <div className="text-2xl mb-1">🇪🇺</div>
              <div className="font-medium">Metric</div>
              <div className="text-sm opacity-70">kg, cm</div>
            </button>
            <button
              onClick={() => handleUnitSystemChange('imperial')}
              disabled={isSaving}
              className={`flex-1 p-4 rounded-xl transition-all ${
                profile.preferredUnitSystem === 'imperial'
                  ? 'bg-macro-calories text-white ring-2 ring-macro-calories'
                  : 'bg-bg-elevated text-text-primary hover:bg-bg-surface'
              }`}
            >
              <div className="text-2xl mb-1">🇺🇸</div>
              <div className="font-medium">Imperial</div>
              <div className="text-sm opacity-70">lbs, ft</div>
            </button>
          </div>
        </section>

        {/* Profile */}
        <section className="card">
          <h2 className="text-card-title text-text-secondary mb-4">Profile</h2>
          
          {/* Height */}
          <div className="py-3 border-b border-border-subtle">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body text-text-primary">Height</p>
                <p className="text-caption text-text-muted">
                  {formatHeight(profile.heightCm, profile.preferredUnitSystem === 'imperial' ? 'ft' : 'cm')}
                </p>
              </div>
              {editingField === 'height' ? (
                <div className="flex items-center gap-2">
                  {profile.preferredUnitSystem === 'imperial' ? (
                    <div className="flex gap-1">
                      <input
                        type="number"
                        value={heightFeet}
                        onChange={(e) => setHeightFeet(Number(e.target.value))}
                        className="input-field w-14 text-center"
                        min={4}
                        max={7}
                      />
                      <span className="text-text-muted self-center">&apos;</span>
                      <input
                        type="number"
                        value={heightInches}
                        onChange={(e) => setHeightInches(Number(e.target.value))}
                        className="input-field w-14 text-center"
                        min={0}
                        max={11}
                      />
                      <span className="text-text-muted self-center">&quot;</span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={tempValue as number}
                      onChange={(e) => setTempValue(Number(e.target.value))}
                      className="input-field w-20 text-center"
                      min={100}
                      max={250}
                    />
                  )}
                  <button
                    onClick={handleHeightSave}
                    disabled={isSaving}
                    className="p-2 rounded-lg bg-macro-protein text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setEditingField(null)}
                    className="p-2 rounded-lg bg-bg-elevated text-text-muted"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingField('height');
                    setTempValue(profile.heightCm);
                  }}
                  className="p-2 rounded-lg bg-bg-elevated text-text-secondary hover:bg-bg-surface"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Sex */}
          <div className="py-3 border-b border-border-subtle">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body text-text-primary">Biological Sex</p>
                <p className="text-caption text-text-muted capitalize">{profile.sex}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => saveField('sex', 'male')}
                  disabled={isSaving}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    profile.sex === 'male'
                      ? 'bg-macro-calories text-white'
                      : 'bg-bg-elevated text-text-secondary hover:bg-bg-surface'
                  }`}
                >
                  ♂️ Male
                </button>
                <button
                  onClick={() => saveField('sex', 'female')}
                  disabled={isSaving}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    profile.sex === 'female'
                      ? 'bg-macro-calories text-white'
                      : 'bg-bg-elevated text-text-secondary hover:bg-bg-surface'
                  }`}
                >
                  ♀️ Female
                </button>
              </div>
            </div>
          </div>

          {/* Birth Date */}
          <div className="py-3 border-b border-border-subtle">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body text-text-primary">Birth Date</p>
                <p className="text-caption text-text-muted">
                  {new Date(profile.birthDate).toLocaleDateString()} ({calculateAge(profile.birthDate)} years old)
                </p>
              </div>
              {editingField === 'birthDate' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={tempValue as string}
                    onChange={(e) => setTempValue(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="input-field"
                  />
                  <button
                    onClick={() => saveField('birthDate', tempValue)}
                    disabled={isSaving}
                    className="p-2 rounded-lg bg-macro-protein text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setEditingField(null)}
                    className="p-2 rounded-lg bg-bg-elevated text-text-muted"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingField('birthDate');
                    setTempValue(profile.birthDate);
                  }}
                  className="p-2 rounded-lg bg-bg-elevated text-text-secondary hover:bg-bg-surface"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Athlete Status */}
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body text-text-primary">Athlete Status</p>
                <p className="text-caption text-text-muted">
                  {profile.athleteStatus ? 'Training 7+ hours/week' : 'Standard activity'}
                </p>
              </div>
              <button
                onClick={() => saveField('athleteStatus', !profile.athleteStatus)}
                disabled={isSaving}
                className={`w-12 h-7 rounded-full p-1 transition-colors ${
                  profile.athleteStatus ? 'bg-macro-protein' : 'bg-bg-elevated'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-all ${
                  profile.athleteStatus ? 'ml-5' : 'ml-0'
                }`} />
              </button>
            </div>
          </div>
        </section>

        {/* Goals */}
        <section className="card">
          <h2 className="text-card-title text-text-secondary mb-4">Goals</h2>
          
          {/* Goal Type */}
          <div className="py-3 border-b border-border-subtle">
            <p className="text-body text-text-primary mb-2">Goal</p>
            <div className="flex gap-2">
              {[
                { value: 'lose', label: '📉 Lose', color: 'bg-red-500' },
                { value: 'maintain', label: '⚖️ Maintain', color: 'bg-blue-500' },
                { value: 'gain', label: '💪 Gain', color: 'bg-green-500' },
              ].map((goal) => (
                <button
                  key={goal.value}
                  onClick={() => saveField('goalType', goal.value)}
                  disabled={isSaving}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                    profile.goalType === goal.value
                      ? 'bg-macro-calories text-white'
                      : 'bg-bg-elevated text-text-secondary hover:bg-bg-surface'
                  }`}
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </div>

          {/* Goal Rate */}
          {profile.goalType !== 'maintain' && (
            <div className="py-3 border-b border-border-subtle">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-body text-text-primary">Weekly Rate</p>
                  <p className="text-caption text-text-muted">
                    {profile.preferredUnitSystem === 'imperial' 
                      ? `${kgToLbs(profile.goalRate)} lbs/week`
                      : `${profile.goalRate} kg/week`}
                  </p>
                </div>
                {editingField === 'goalRate' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={tempValue as number}
                      onChange={(e) => setTempValue(Number(e.target.value))}
                      step={profile.preferredUnitSystem === 'imperial' ? 0.1 : 0.05}
                      min={0.1}
                      max={2}
                      className="input-field w-20 text-center"
                    />
                    <span className="text-sm text-text-muted">
                      {profile.preferredUnitSystem === 'imperial' ? 'lbs' : 'kg'}
                    </span>
                    <button
                      onClick={handleGoalRateSave}
                      disabled={isSaving}
                      className="p-2 rounded-lg bg-macro-protein text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setEditingField(null)}
                      className="p-2 rounded-lg bg-bg-elevated text-text-muted"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingField('goalRate');
                      setTempValue(
                        profile.preferredUnitSystem === 'imperial' 
                          ? kgToLbs(profile.goalRate) 
                          : profile.goalRate
                      );
                    }}
                    className="p-2 rounded-lg bg-bg-elevated text-text-secondary hover:bg-bg-surface"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Calorie Goal */}
          <div className="py-3 border-b border-border-subtle">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body text-text-primary">Daily Calories</p>
                <p className="text-caption text-text-muted">{profile.calorieGoal} kcal</p>
              </div>
              {editingField === 'calorieGoal' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempValue as number}
                    onChange={(e) => setTempValue(Number(e.target.value))}
                    step={50}
                    min={1000}
                    max={5000}
                    className="input-field w-24 text-center"
                  />
                  <button
                    onClick={() => saveField('calorieGoal', tempValue)}
                    disabled={isSaving}
                    className="p-2 rounded-lg bg-macro-protein text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setEditingField(null)}
                    className="p-2 rounded-lg bg-bg-elevated text-text-muted"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingField('calorieGoal');
                    setTempValue(profile.calorieGoal);
                  }}
                  className="p-2 rounded-lg bg-bg-elevated text-text-secondary hover:bg-bg-surface"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Macro Goals */}
          {['proteinGoal', 'carbsGoal', 'fatGoal'].map((field) => {
            const labels: Record<string, { name: string; color: string }> = {
              proteinGoal: { name: 'Protein', color: 'text-macro-protein' },
              carbsGoal: { name: 'Carbs', color: 'text-macro-carbs' },
              fatGoal: { name: 'Fat', color: 'text-macro-fat' },
            };
            const { name, color } = labels[field];
            const value = profile[field as keyof ProfileData] as number;
            
            return (
              <div key={field} className="py-3 border-b border-border-subtle last:border-b-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-body ${color}`}>{name}</p>
                    <p className="text-caption text-text-muted">{value}g</p>
                  </div>
                  {editingField === field ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={tempValue as number}
                        onChange={(e) => setTempValue(Number(e.target.value))}
                        step={5}
                        min={0}
                        max={500}
                        className="input-field w-20 text-center"
                      />
                      <button
                        onClick={() => saveField(field, tempValue)}
                        disabled={isSaving}
                        className="p-2 rounded-lg bg-macro-protein text-white"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setEditingField(null)}
                        className="p-2 rounded-lg bg-bg-elevated text-text-muted"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingField(field);
                        setTempValue(value);
                      }}
                      className="p-2 rounded-lg bg-bg-elevated text-text-secondary hover:bg-bg-surface"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Security - Passkeys */}
        <section className="card">
          <h2 className="text-card-title text-text-secondary mb-4">Security</h2>
          <PasskeyManager />
        </section>

        {/* Data Export */}
        <section className="card">
          <h2 className="text-card-title text-text-secondary mb-4">Data Export</h2>
          <p className="text-caption text-text-muted mb-4">
            Download your data as a JSON file and a ZIP of CSVs.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_SCOPES.map((scope) => (
              <button
                key={scope.value}
                onClick={() => setExportScope(scope.value)}
                disabled={isExporting}
                className={`rounded-lg p-3 text-left transition-colors ${
                  exportScope === scope.value
                    ? 'bg-macro-calories text-white'
                    : 'bg-bg-elevated text-text-secondary hover:bg-bg-surface'
                }`}
              >
                <div className="text-body font-medium">{scope.label}</div>
                <div className="text-caption opacity-80">{scope.description}</div>
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn-primary w-full mt-4 disabled:opacity-60"
          >
            {isExporting ? 'Exporting...' : 'Export Data'}
          </button>
          {exportStatus && (
            <p className="text-caption text-text-muted mt-3">{exportStatus}</p>
          )}
        </section>

        {/* Account */}
        <section className="card">
          <h2 className="text-card-title text-text-secondary mb-4">Account</h2>
          
          <button
            onClick={() => router.push('/onboarding')}
            className="w-full py-3 px-4 rounded-xl bg-bg-elevated text-text-secondary 
                       hover:bg-bg-surface transition-colors text-left flex items-center justify-between"
          >
            <span>Re-run Setup Wizard</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          
          <button
            onClick={async () => {
              try {
                await signOut();
                showToast('Signed out successfully', 'success');
              } catch (error) {
                console.error('Sign out error:', error);
                showToast('Failed to sign out', 'error');
              }
            }}
            className="w-full mt-3 py-3 px-4 rounded-xl bg-red-500/10 text-red-400 
                       hover:bg-red-500/20 transition-colors text-left flex items-center justify-between"
          >
            <span>Sign Out</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </section>
      </main>

      {/* Bottom Navigation */}
      <BottomNav showAdd={false} />
    </div>
  );
}
