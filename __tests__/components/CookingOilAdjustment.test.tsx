import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookingOilAdjustment } from '@/components/ui/CookingOilAdjustment';

function ControlledCookingOilAdjustment({
  initialTeaspoons = 0,
}: {
  initialTeaspoons?: number;
}) {
  const [teaspoons, setTeaspoons] = useState(initialTeaspoons);

  return (
    <CookingOilAdjustment
      teaspoons={teaspoons}
      onChange={setTeaspoons}
    />
  );
}

describe('CookingOilAdjustment', () => {
  it('starts with None selected and no nutrition preview', () => {
    render(<ControlledCookingOilAdjustment />);

    expect(
      screen.getByRole('heading', { name: 'Was cooking oil left out?' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only if (?:the )?oil is not already listed/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText(/\+\d+ kcal/)).not.toBeInTheDocument();
  });

  it('selects 1 tsp and shows its nutrition preview', async () => {
    const user = userEvent.setup();
    render(<ControlledCookingOilAdjustment />);

    await user.click(screen.getByRole('button', { name: '1 tsp' }));

    expect(screen.getByRole('button', { name: '1 tsp' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('+40 kcal · +4.5g fat')).toBeInTheDocument();
  });

  it('selects 1 tbsp as 3 tsp and shows its nutrition preview', async () => {
    const user = userEvent.setup();
    render(<ControlledCookingOilAdjustment />);

    await user.click(screen.getByRole('button', { name: '1 tbsp (3 tsp)' }));

    expect(
      screen.getByRole('button', { name: '1 tbsp (3 tsp)' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('+120 kcal · +13.5g fat')).toBeInTheDocument();
  });

  it('accepts a custom teaspoon amount and updates the preview', async () => {
    const user = userEvent.setup();
    render(<ControlledCookingOilAdjustment />);

    await user.click(screen.getByRole('button', { name: 'Custom' }));

    const input = screen.getByRole('spinbutton', { name: 'Teaspoons' });
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('step', '0.25');

    await user.clear(input);
    expect(screen.queryByText(/\+\d+ kcal/)).not.toBeInTheDocument();

    await user.type(input, '1.25');

    expect(input).toHaveValue(1.25);
    expect(screen.getByText('+50 kcal · +5.6g fat')).toBeInTheDocument();
  });

  it('clears a selected amount back to None', async () => {
    const user = userEvent.setup();
    render(<ControlledCookingOilAdjustment initialTeaspoons={1} />);

    expect(screen.getByText('+40 kcal · +4.5g fat')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'None' }));

    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByText(/\+\d+ kcal/)).not.toBeInTheDocument();
  });
});
