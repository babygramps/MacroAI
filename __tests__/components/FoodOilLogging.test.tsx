import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextTab } from '@/components/TextTab';
import { PhotoTab } from '@/components/PhotoTab';
import { parseTextLog } from '@/actions/parseTextLog';
import { analyzeImage } from '@/actions/analyzeImage';
import { logMeal } from '@/lib/meal/logMeal';
import { logRemote } from '@/lib/clientLogger';
import type { MealEntry, NormalizedFood } from '@/lib/types';

jest.mock('@/actions/parseTextLog', () => ({
  parseTextLog: jest.fn(),
}));

jest.mock('@/actions/analyzeImage', () => ({
  analyzeImage: jest.fn(),
}));

jest.mock('@/lib/meal/logMeal', () => ({
  logMeal: jest.fn(),
  AmplifyClientNotReadyError: class AmplifyClientNotReadyError extends Error {},
}));

jest.mock('@/components/ui/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('@/lib/clientLogger', () => ({
  logRemote: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'trace-oil-test'),
  getFileContext: jest.fn(() => ({})),
  getErrorContext: jest.fn(() => ({})),
}));

const textFood: NormalizedFood = {
  name: 'Grilled chicken',
  calories: 200,
  protein: 35,
  carbs: 0,
  fat: 6,
  servingSize: 120,
  servingDescription: '120 g',
  servingSizeGrams: 120,
  source: 'USDA',
};

const photoFood: NormalizedFood = {
  name: 'Salmon',
  calories: 250,
  protein: 30,
  carbs: 0,
  fat: 14,
  servingSize: 140,
  servingDescription: '140 g',
  servingSizeGrams: 140,
  source: 'GEMINI',
};

const loggedMeal: MealEntry = {
  id: 'meal-1',
  name: 'Logged meal',
  category: 'snack',
  eatenAt: '2026-07-10T12:00:00.000Z',
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  totalWeightG: 0,
  ingredients: [],
};

const mockParseTextLog = jest.mocked(parseTextLog);
const mockAnalyzeImage = jest.mocked(analyzeImage);
const mockLogMeal = jest.mocked(logMeal);
const mockLogInfo = jest.mocked(logRemote.info);

async function advanceTextToCategory() {
  const user = userEvent.setup();
  render(<TextTab onSuccess={jest.fn()} />);

  await user.type(
    screen.getByRole('textbox', {
      name: '',
    }),
    'grilled chicken'
  );
  await user.click(screen.getByRole('button', { name: /Analyze Meal/ }));
  await screen.findByRole('heading', { name: 'Review Ingredients' });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'What is this?' });

  return user;
}

async function advancePhotoToCategory() {
  const user = userEvent.setup();
  const { container } = render(<PhotoTab onSuccess={jest.fn()} />);
  const galleryInput = container.querySelector(
    'input[type="file"]:not([capture])'
  ) as HTMLInputElement;
  const image = new File(['photo-bytes'], 'meal.jpg', {
    type: 'image/jpeg',
  });

  await user.upload(galleryInput, image);
  await user.click(
    await screen.findByRole('button', { name: 'Analyze Photo' })
  );
  await screen.findByRole('heading', { name: 'Detected Foods' });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'What is this?' });

  return user;
}

describe('cooking oil in food logging flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseTextLog.mockResolvedValue({
      success: true,
      foods: [textFood],
    });
    mockAnalyzeImage.mockResolvedValue({
      success: true,
      foods: [photoFood],
    });
    mockLogMeal.mockResolvedValue({
      verified: true,
      meal: loggedMeal,
    });
  });

  it('appends 1 tsp of cooking oil when logging a typed meal', async () => {
    const user = await advanceTextToCategory();

    await user.click(screen.getByRole('button', { name: '1 tsp' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'Review Ingredients' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: '1 tsp' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await user.click(screen.getByRole('button', { name: 'Log Snack' }));
    await waitFor(() => expect(mockLogMeal).toHaveBeenCalledTimes(1));

    expect(mockLogMeal.mock.calls[0][0].ingredients).toEqual([
      {
        name: 'Grilled chicken',
        weightG: 120,
        calories: 200,
        protein: 35,
        carbs: 0,
        fat: 6,
        source: 'USDA',
        servingDescription: '120 g',
        servingSizeGrams: 120,
      },
      {
        name: 'Cooking oil',
        source: 'MANUAL',
        calories: 40,
        protein: 0,
        carbs: 0,
        fat: 4.5,
        weightG: 5,
        servingDescription: '1 tsp',
        servingSizeGrams: 5,
      },
    ]);
    expect(mockLogInfo).toHaveBeenCalledWith(
      'MEAL_LOG_START',
      expect.objectContaining({
        tab: 'text',
        ingredientCount: 1,
        ingredientNames: ['Grilled chicken'],
        oilTeaspoons: 1,
      })
    );
  });

  it('leaves typed meal ingredients unchanged when None remains selected', async () => {
    const user = await advanceTextToCategory();

    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await user.click(screen.getByRole('button', { name: 'Log Snack' }));
    await waitFor(() => expect(mockLogMeal).toHaveBeenCalledTimes(1));

    expect(mockLogMeal.mock.calls[0][0].ingredients).toEqual([
      {
        name: 'Grilled chicken',
        weightG: 120,
        calories: 200,
        protein: 35,
        carbs: 0,
        fat: 6,
        source: 'USDA',
        servingDescription: '120 g',
        servingSizeGrams: 120,
      },
    ]);
    expect(mockLogInfo).toHaveBeenCalledWith(
      'MEAL_LOG_START',
      expect.objectContaining({
        tab: 'text',
        oilTeaspoons: 0,
      })
    );
  });

  it('resets typed-meal oil after returning to input and analyzing again', async () => {
    const user = await advanceTextToCategory();

    await user.click(screen.getByRole('button', { name: '1 tsp' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(
      screen.getByRole('button', { name: 'Edit description' })
    );
    await user.click(screen.getByRole('button', { name: /Analyze Meal/ }));
    await screen.findByRole('heading', { name: 'Review Ingredients' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('appends 2 tsp of cooking oil when logging a photo meal', async () => {
    const user = await advancePhotoToCategory();

    await user.click(screen.getByRole('button', { name: '2 tsp' }));
    await user.click(screen.getByRole('button', { name: 'Log Snack' }));
    await waitFor(() => expect(mockLogMeal).toHaveBeenCalledTimes(1));

    expect(mockLogMeal.mock.calls[0][0].ingredients).toEqual([
      {
        name: 'Salmon',
        weightG: 140,
        calories: 250,
        protein: 30,
        carbs: 0,
        fat: 14,
        source: 'GEMINI',
        servingDescription: '140 g',
        servingSizeGrams: 140,
      },
      {
        name: 'Cooking oil',
        source: 'MANUAL',
        calories: 80,
        protein: 0,
        carbs: 0,
        fat: 9,
        weightG: 9,
        servingDescription: '2 tsp',
        servingSizeGrams: 9,
      },
    ]);
    expect(mockLogInfo).toHaveBeenCalledWith(
      'MEAL_LOG_START',
      expect.objectContaining({
        tab: 'photo',
        ingredientCount: 1,
        ingredientNames: ['Salmon'],
        oilTeaspoons: 2,
      })
    );
  });
});
