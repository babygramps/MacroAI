import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MacroGoalsStep } from '@/components/onboarding/MacroGoalsStep';
import type { MacroGrams } from '@/lib/macroMath';

function ControlledMacroGoalsStep({
  calorieGoal = 2000,
  initial = { protein: 150, carbs: 200, fat: 0 },
}: {
  calorieGoal?: number;
  initial?: MacroGrams;
}) {
  const [grams, setGrams] = useState<MacroGrams>(initial);
  return <MacroGoalsStep calorieGoal={calorieGoal} grams={grams} onChange={setGrams} />;
}

describe('MacroGoalsStep', () => {
  it('shows each macro as a percentage of the calorie goal', () => {
    render(<ControlledMacroGoalsStep />);

    // protein 150g*4 = 600 kcal of 2000 = 30%
    expect(screen.getByText('30% of calories')).toBeInTheDocument();
    // carbs 200g*4 = 800 kcal of 2000 = 40%
    expect(screen.getByText('40% of calories')).toBeInTheDocument();
  });

  it('surfaces unallocated calories and clears once balanced', () => {
    render(<ControlledMacroGoalsStep />);

    // 2000 - (600 + 800) = 600 kcal unallocated
    expect(screen.getByRole('status')).toHaveTextContent('600 kcal not yet allocated');

    // "use rest" on fat absorbs the remainder: 600/9 ≈ 67g
    fireEvent.click(screen.getAllByRole('button', { name: 'use rest' })[2]);

    expect(screen.getByLabelText('Fat grams')).toHaveValue('67');
    expect(screen.getByRole('status')).toHaveTextContent(/Adds up to your 2000 kcal goal/);
    // Balanced: the shortcut buttons disappear
    expect(screen.queryByRole('button', { name: 'use rest' })).not.toBeInTheDocument();
  });

  it('accepts exact typed gram values', () => {
    render(<ControlledMacroGoalsStep />);

    const protein = screen.getByLabelText('Protein grams');
    fireEvent.change(protein, { target: { value: '163' } });

    expect(protein).toHaveValue('163');
    // 163*4 = 652 kcal of 2000 -> 33%
    expect(screen.getByText('33% of calories')).toBeInTheDocument();
  });

  it('applies a percentage-split preset to all three macros', () => {
    render(<ControlledMacroGoalsStep initial={{ protein: 0, carbs: 0, fat: 0 }} />);

    fireEvent.click(screen.getByRole('button', { name: /High protein/ }));

    expect(screen.getByLabelText('Protein grams')).toHaveValue('200'); // 40% of 2000 / 4
    expect(screen.getByLabelText('Carbs grams')).toHaveValue('175'); // 35% of 2000 / 4
    expect(screen.getByLabelText('Fat grams')).toHaveValue('56'); // 25% of 2000 / 9
  });

  it('treats over-allocation as a warning, not an error', () => {
    render(
      <ControlledMacroGoalsStep
        calorieGoal={1000}
        initial={{ protein: 200, carbs: 200, fat: 50 }}
      />
    );

    // 1600 + 450 = 2050 kcal vs 1000 goal
    expect(screen.getByRole('status')).toHaveTextContent('1050 kcal over your goal');
  });
});
