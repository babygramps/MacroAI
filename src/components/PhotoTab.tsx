'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { analyzeImage } from '@/actions/analyzeImage';
import { getAmplifyDataClient } from '@/lib/data/amplifyClient';
import type { NormalizedFood, MealCategory, MealEntry, IngredientEntry } from '@/lib/types';
import { MEAL_CATEGORY_INFO } from '@/lib/types';
import { calculateMealTotals } from '@/lib/meal/totals';
import { onMealLogged } from '@/lib/metabolicService';
import { verifyMealById } from '@/lib/meal/mealVerification';
import { CategoryPicker } from './ui/CategoryPicker';
import { showToast } from './ui/Toast';
import { SourceBadge, SourceSummary } from './ui/SourceBadge';
import { logRemote, getFileContext, getErrorContext, generateTraceId } from '@/lib/clientLogger';
import { getLocalDateString } from '@/lib/date';

interface PhotoTabProps {
  onSuccess: (options?: { verified?: boolean; meal?: MealEntry }) => void;
}

type View = 'input' | 'describe' | 'loading' | 'review' | 'category';

export function PhotoTab({ onSuccess }: PhotoTabProps) {
  const [image, setImage] = useState<string | null>(null);
  const [results, setResults] = useState<NormalizedFood[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [view, setView] = useState<View>('input');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Description to help AI understand the meal
  const [description, setDescription] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Category selection state
  const [category, setCategory] = useState<MealCategory>('meal');
  const [mealName, setMealName] = useState('');

  // Error state for analysis failures
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const processFile = useCallback((file: File, source: 'camera' | 'gallery' | 'paste') => {
    // Log file selection for debugging
    logRemote.info('Photo selected', {
      ...getFileContext(file),
      inputType: source,
    });

    // Check for potential issues early
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      logRemote.warn('Large file selected', {
        ...getFileContext(file),
        maxAllowed: MAX_FILE_SIZE,
      });
    }

    // Show preview and store file for later
    const reader = new FileReader();
    reader.onerror = () => {
      logRemote.error('FileReader error', {
        ...getFileContext(file),
        readerError: reader.error?.message,
      });
    };
    reader.onload = () => {
      setImage(reader.result as string);
      logRemote.debug('Photo preview loaded', {
        ...getFileContext(file),
        previewLength: (reader.result as string)?.length,
      });
    };
    reader.readAsDataURL(file);
    setPendingFile(file);
    setView('describe');
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file, e.target.capture ? 'camera' : 'gallery');
  }, [processFile]);

  // Handle paste events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only handle paste in the input view or describe view (to replace)
      if (view !== 'input' && view !== 'describe') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file, 'paste');
            e.preventDefault(); // Prevent default paste behavior
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [view, processFile]);

  const handleAnalyze = useCallback(async () => {
    if (!pendingFile || !image) return;

    // Clear any previous error
    setErrorMessage(null);

    // Log analysis start with file details
    const traceId = generateTraceId();
    const estimatedBase64Bytes = Math.ceil((pendingFile.size * 4) / 3);
    const estimatedUploadBytes = pendingFile.size + (description.trim().length || 0) + 1024;

    logRemote.info('Photo analysis started', {
      traceId,
      ...getFileContext(pendingFile),
      hasDescription: !!description.trim(),
      descriptionLength: description.trim().length,
      estimatedBase64Bytes,
      estimatedBase64MB: Math.round((estimatedBase64Bytes / 1024 / 1024) * 100) / 100,
      estimatedUploadBytes,
      estimatedUploadMB: Math.round((estimatedUploadBytes / 1024 / 1024) * 100) / 100,
    });

    setView('loading');
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('image', pendingFile);
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      const result = await analyzeImage(formData);

      // Log the result
      logRemote.info('Photo analysis completed', {
        traceId,
        ...getFileContext(pendingFile),
        durationMs: Date.now() - startTime,
        success: result.success,
        foodsDetected: result.foods.length,
        foodNames: result.foods.map((f: NormalizedFood) => f.name),
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
        errorDetails: result.error?.details ? String(result.error.details).slice(0, 500) : undefined,
      });

      if (!result.success || result.foods.length === 0) {
        // Show error message from server
        const message = result.error?.message || 'No food items detected. Please try again.';
        setErrorMessage(message);
        setView('describe');
        return;
      }

      setResults(result.foods);
      setSelectedItems(new Set(result.foods.map((_: NormalizedFood, i: number) => i)));
      setView('review');
    } catch (error) {
      // Log detailed error for debugging
      logRemote.error('Photo analysis failed', {
        traceId,
        ...getFileContext(pendingFile),
        ...getErrorContext(error),
        durationMs: Date.now() - startTime,
        hasDescription: !!description.trim(),
        descriptionLength: description.trim().length,
        estimatedBase64Bytes,
        estimatedBase64MB: Math.round((estimatedBase64Bytes / 1024 / 1024) * 100) / 100,
        estimatedUploadBytes,
        estimatedUploadMB: Math.round((estimatedUploadBytes / 1024 / 1024) * 100) / 100,
      });

      console.error('Image analysis error:', error);
      setErrorMessage('Something went wrong. Please try again.');
      setView('describe');
    }
  }, [pendingFile, image, description]);

  const toggleItem = (index: number) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleContinueToCategory = () => {
    if (selectedItems.size === 0) return;

    // Generate a default meal name
    const selectedFoods = results.filter((_, i) => selectedItems.has(i));
    const defaultName = selectedFoods.length === 1
      ? selectedFoods[0].name
      : selectedFoods.map(f => f.name).slice(0, 2).join(' & ');

    setMealName(defaultName);
    // Default to meal for multi-ingredient, snack for single
    setCategory(selectedFoods.length > 1 ? 'meal' : 'snack');
    setView('category');
  };

  const handleLogMeal = async () => {
    if (selectedItems.size === 0) return;

    const traceId = generateTraceId();
    const selectedFoods = results.filter((_, i) => selectedItems.has(i));

    logRemote.info('MEAL_LOG_START', {
      traceId,
      tab: 'photo',
      mealName,
      category,
      ingredientCount: selectedFoods.length,
      ingredientNames: selectedFoods.map(f => f.name),
    });

    setIsSaving(true);
    try {
      const client = getAmplifyDataClient();
      if (!client) {
        logRemote.error('MEAL_LOG_ERROR', { traceId, error: 'Amplify client not ready' });
        showToast('Amplify is not ready yet. Please try again.', 'error');
        setIsSaving(false);
        return;
      }

      // Calculate totals
      const ingredients = selectedFoods.map((food) => ({
        name: food.name,
        weightG: food.servingSize || 100,
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fat: food.fat || 0,
        source: food.source,
      }));

      const totals = calculateMealTotals(ingredients);
      const now = new Date();
      const nowISO = now.toISOString();
      const localDate = getLocalDateString(now);

      // Create the meal
      const { data: meal } = await client.models.Meal.create({
        name: mealName || 'Meal',
        category,
        eatenAt: nowISO,
        localDate, // Store user's local date for unambiguous day queries
        totalCalories: totals.totalCalories,
        totalProtein: totals.totalProtein,
        totalCarbs: totals.totalCarbs,
        totalFat: totals.totalFat,
        totalWeightG: totals.totalWeightG,
      });

      if (!meal) {
        logRemote.error('MEAL_CREATE_FAILED', { traceId, error: 'Meal.create returned null' });
        throw new Error('Failed to create meal');
      }

      logRemote.info('MEAL_CREATED', { traceId, mealId: meal.id, eatenAt: nowISO, localDate });

      // Create all ingredients
      let ingredientsCreated = 0;
      const createdIngredients: IngredientEntry[] = [];

      for (let i = 0; i < selectedFoods.length; i++) {
        const food = selectedFoods[i];
        // Note: servingSizeGrams must be an integer (schema constraint)
        const servingSizeGramsInt = food.servingSizeGrams
          ? Math.round(food.servingSizeGrams)
          : undefined;

        const { data: ingredient } = await client.models.MealIngredient.create({
          mealId: meal.id,
          name: food.name,
          eatenAt: nowISO,
          localDate, // Store user's local date for unambiguous day queries
          weightG: food.servingSize || 100,
          calories: food.calories || 0,
          protein: food.protein || 0,
          carbs: food.carbs || 0,
          fat: food.fat || 0,
          source: food.source,
          servingDescription: food.servingDescription || undefined,
          servingSizeGrams: servingSizeGramsInt,
          sortOrder: i,
        });

        if (ingredient) {
          ingredientsCreated++;
          createdIngredients.push({
            id: ingredient.id,
            mealId: meal.id,
            name: ingredient.name,
            weightG: ingredient.weightG,
            calories: ingredient.calories,
            protein: ingredient.protein,
            carbs: ingredient.carbs,
            fat: ingredient.fat,
            source: ingredient.source,
            servingDescription: ingredient.servingDescription,
            servingSizeGrams: ingredient.servingSizeGrams,
            sortOrder: ingredient.sortOrder ?? i,
          });
        }
      }

      logRemote.info('INGREDIENTS_CREATED', { traceId, mealId: meal.id, count: ingredientsCreated, expected: selectedFoods.length });

      // Verify meal is readable using strongly consistent get
      const { verified, attempts } = await verifyMealById(client, meal.id, { traceId });

      // Trigger metabolic recalculation
      await onMealLogged(now);

      logRemote.info('MEAL_LOG_COMPLETE', { traceId, mealId: meal.id, verified, attempts });

      // Construct optimistic meal entry
      const optimisticMeal: MealEntry = {
        id: meal.id,
        name: meal.name,
        category: meal.category as MealCategory,
        eatenAt: meal.eatenAt,
        totalCalories: meal.totalCalories,
        totalProtein: meal.totalProtein,
        totalCarbs: meal.totalCarbs,
        totalFat: meal.totalFat,
        totalWeightG: meal.totalWeightG,
        ingredients: createdIngredients,
      };

      const categoryInfo = MEAL_CATEGORY_INFO[category];
      showToast(`${categoryInfo.emoji} ${mealName} logged!`, 'success');
      onSuccess({ verified, meal: optimisticMeal });
    } catch (error) {
      logRemote.error('MEAL_LOG_ERROR', { traceId, ...getErrorContext(error) });
      console.error('Error logging meal:', error);
      showToast('Failed to log meal. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setImage(null);
    setResults([]);
    setSelectedItems(new Set());
    setDescription('');
    setPendingFile(null);
    setErrorMessage(null);
    setView('input');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const totals = results
    .filter((_, i) => selectedItems.has(i))
    .reduce(
      (acc, food) => ({
        calories: acc.calories + (food.calories || 0),
        protein: acc.protein + (food.protein || 0),
        carbs: acc.carbs + (food.carbs || 0),
        fat: acc.fat + (food.fat || 0),
        weight: acc.weight + (food.servingSize || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, weight: 0 }
    );

  // Category selection view
  if (view === 'category' && image) {
    const selectedFoods = results.filter((_, i) => selectedItems.has(i));

    return (
      <div className="p-4 pb-safe">
        <button
          onClick={() => setView('review')}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h3 className="text-section-title text-center mb-6">What is this?</h3>

        {/* Category picker */}
        <div className="mb-6">
          <CategoryPicker value={category} onChange={setCategory} />
        </div>

        {/* Meal name input */}
        <div className="mb-6">
          <label className="text-caption block mb-2">Name</label>
          <input
            type="text"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            className="input-field"
            placeholder="e.g., Breakfast, Lunch, Afternoon Snack"
          />
        </div>

        {/* Summary card */}
        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{MEAL_CATEGORY_INFO[category].emoji}</span>
            <div>
              <p className="font-medium text-text-primary">{mealName}</p>
              <p className="text-caption">{selectedFoods.length} item{selectedFoods.length !== 1 ? 's' : ''}</p>
              <SourceSummary sources={selectedFoods.map(f => f.source)} />
            </div>
          </div>

          {/* Items preview */}
          <div className="space-y-1 mb-4 pl-9">
            {selectedFoods.slice(0, 3).map((food, i) => (
              <p key={i} className="text-xs text-text-muted truncate">
                • {food.name} (~{food.servingSize}g)
                {food.source === 'GEMINI' && <span className="text-amber-400 ml-1">✦</span>}
              </p>
            ))}
            {selectedFoods.length > 3 && (
              <p className="text-xs text-text-muted">
                + {selectedFoods.length - 3} more
              </p>
            )}
          </div>

          <div className="macro-grid text-center">
            <div>
              <p className="font-mono font-bold text-macro-calories">{Math.round(totals.calories)}</p>
              <p className="text-caption">kcal</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-protein">{Math.round(totals.protein)}g</p>
              <p className="text-caption">protein</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-carbs">{Math.round(totals.carbs)}g</p>
              <p className="text-caption">carbs</p>
            </div>
            <div>
              <p className="font-mono font-bold text-macro-fat">{Math.round(totals.fat)}g</p>
              <p className="text-caption">fat</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogMeal}
          disabled={isSaving || !mealName.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <div className="spinner" />
              Saving...
            </>
          ) : (
            `Log ${MEAL_CATEGORY_INFO[category].label}`
          )}
        </button>
      </div>
    );
  }

  // Describe view - add context before analysis
  if (view === 'describe' && image) {
    return (
      <div className="p-4 pb-safe">
        <button
          onClick={handleReset}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Take another photo
        </button>

        {/* Image preview */}
        <div className="aspect-video rounded-xl overflow-hidden bg-bg-elevated mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Food" className="w-full h-full object-cover" />
        </div>

        {/* Error message */}
        {errorMessage ? (
          <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-red-400 font-medium text-sm">Analysis Failed</p>
                <p className="text-red-300/80 text-sm mt-1">{errorMessage}</p>
              </div>
            </div>
          </div>
        ) : null}

        <h3 className="text-section-title mb-2">Add Details (Optional)</h3>
        <p className="text-caption text-text-muted mb-4">
          Describe your meal to help AI identify foods and estimate portions more accurately.
        </p>

        {/* Description input */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Chipotle burrito bowl with double chicken, white rice, black beans, mild salsa, cheese, and guac"
          className="input-field w-full h-24 resize-none mb-4"
          maxLength={500}
        />

        {/* Character count */}
        <p className="text-caption text-text-muted text-right mb-4">
          {description.length}/500
        </p>

        {/* Tips */}
        <div className="card mb-6">
          <h4 className="text-card-title mb-2">💡 Tips for better results</h4>
          <ul className="text-caption text-text-muted space-y-1">
            <li>• Mention restaurant or brand names</li>
            <li>• Include portion sizes if known (e.g., &quot;6oz steak&quot;)</li>
            <li>• Note cooking methods (grilled, fried, etc.)</li>
            <li>• Describe hidden ingredients (sauces, dressings)</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleAnalyze}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Analyze Photo
          </button>
        </div>
      </div>
    );
  }

  // Review view
  if (view === 'review' && results.length > 0 && image) {
    return (
      <div className="p-4 pb-safe">
        <button
          onClick={handleReset}
          className="mb-4 text-text-secondary flex items-center gap-2 hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Take another photo
        </button>

        {/* Image preview */}
        <div className="aspect-video rounded-xl overflow-hidden bg-bg-elevated mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Food" className="w-full h-full object-cover" />
        </div>

        <h3 className="text-section-title mb-4">Detected Foods</h3>

        {/* AI estimate friction banner */}
        {results.some(f => f.source === 'GEMINI') && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <span className="text-amber-400 text-sm mt-0.5">✦</span>
              <p className="text-xs text-amber-300/90">
                Some items used <strong>AI estimates</strong> because they weren&apos;t found in the USDA database. AI estimates may be less accurate — consider verifying weights and nutrition.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 mb-6">
          {results.map((food, index) => (
            <button
              key={index}
              onClick={() => toggleItem(index)}
              className={`card text-left transition-all ${selectedItems.has(index)
                ? 'border-macro-calories/50'
                : 'opacity-50'
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedItems.has(index)
                    ? 'border-macro-calories bg-macro-calories'
                    : 'border-border-subtle'
                    }`}
                >
                  {selectedItems.has(index) && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-text-primary truncate">
                      {food.name} (~{food.servingSize}g)
                    </p>
                    <SourceBadge source={food.source} compact />
                  </div>
                  <p className="text-caption">
                    {food.calories} kcal • {food.protein}g P
                  </p>
                  {food.warnings && food.warnings.length > 0 && (
                    <p className="text-[10px] text-amber-400 mt-0.5">
                      ⚠ {food.warnings[0]}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Totals */}
        <div className="card mb-6">
          <h4 className="text-card-title mb-3">Total ({selectedItems.size} items)</h4>
          <div className="macro-grid text-center">
            <div>
              <p className="text-lg font-mono font-bold text-macro-calories">{Math.round(totals.calories)}</p>
              <p className="text-caption">kcal</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-macro-protein">{Math.round(totals.protein)}g</p>
              <p className="text-caption">protein</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-macro-carbs">{Math.round(totals.carbs)}g</p>
              <p className="text-caption">carbs</p>
            </div>
            <div>
              <p className="text-lg font-mono font-bold text-macro-fat">{Math.round(totals.fat)}g</p>
              <p className="text-caption">fat</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleContinueToCategory}
          disabled={selectedItems.size === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  // Loading state
  if (view === 'loading' && image) {
    return (
      <div className="p-4 pb-safe">
        <div className="aspect-video rounded-xl overflow-hidden bg-bg-elevated mb-4 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Food" className="w-full h-full object-cover opacity-50" />
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <div className="w-12 h-12 border-4 border-macro-calories border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-text-primary font-medium">Analyzing with AI...</p>
            <p className="text-caption">Identifying foods in your image</p>
          </div>
        </div>
      </div>
    );
  }

  // Input view
  return (
    <div className="p-4 pb-safe">
      <p className="text-body text-text-secondary mb-6 text-center">
        Take a photo, choose from gallery, or paste an image (Ctrl+V)
      </p>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Camera button */}
      <button
        onClick={() => cameraInputRef.current?.click()}
        className="w-full aspect-square max-w-xs mx-auto bg-bg-elevated rounded-2xl flex flex-col items-center justify-center gap-4 hover:bg-bg-surface transition-colors mb-4"
      >
        <div className="w-20 h-20 rounded-full bg-bg-surface flex items-center justify-center">
          <svg className="w-10 h-10 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-text-secondary">Tap to take a photo</p>
      </button>

      {/* Gallery option */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full text-center text-text-secondary hover:text-macro-calories transition-colors"
      >
        or choose from gallery
      </button>

      {/* Tips */}
      <div className="mt-8">
        <p className="text-caption mb-2">Tips for best results:</p>
        <ul className="text-caption text-text-muted space-y-1">
          <li>• Good lighting helps accuracy</li>
          <li>• Capture the entire plate</li>
          <li>• Keep portions visible and separated</li>
        </ul>
      </div>
    </div>
  );
}
