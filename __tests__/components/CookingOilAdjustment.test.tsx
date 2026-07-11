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

  it('selects 2 tsp and shows its nutrition preview', async () => {
    const user = userEvent.setup();
    render(<ControlledCookingOilAdjustment />);

    await user.click(screen.getByRole('button', { name: '2 tsp' }));

    expect(screen.getByRole('button', { name: '2 tsp' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('+80 kcal · +9g fat')).toBeInTheDocument();
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

  it('keeps the nutrition status region mounted as its text updates', async () => {
    const user = userEvent.setup();
    render(<ControlledCookingOilAdjustment />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('No cooking oil added');

    await user.click(screen.getByRole('button', { name: '1 tsp' }));

    expect(status).toHaveTextContent('+40 kcal · +4.5g fat');
    expect(screen.getByRole('status')).toBe(status);

    await user.click(screen.getByRole('button', { name: 'None' }));

    expect(status).toHaveTextContent('No cooking oil added');
    expect(screen.getByRole('status')).toBe(status);
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

  it.each([
    { nextTeaspoons: 0, activeButton: 'None' },
    { nextTeaspoons: 2, activeButton: '2 tsp' },
  ])(
    'closes a custom input when controlled teaspoons changes to $nextTeaspoons',
    ({ nextTeaspoons, activeButton }) => {
      const onChange = jest.fn();
      const { rerender } = render(
        <CookingOilAdjustment teaspoons={1.25} onChange={onChange} />
      );

      expect(
        screen.getByRole('spinbutton', { name: 'Teaspoons' })
      ).toBeInTheDocument();

      rerender(
        <CookingOilAdjustment
          teaspoons={nextTeaspoons}
          onChange={onChange}
        />
      );

      expect(
        screen.queryByRole('spinbutton', { name: 'Teaspoons' })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: activeButton })
      ).toHaveAttribute('aria-pressed', 'true');
    }
  );

  it.each([
    { value: -1, label: 'negative' },
    { value: Number.NaN, label: 'NaN' },
    { value: Number.POSITIVE_INFINITY, label: 'Infinity' },
  ])(
    'normalizes a $label controlled value to None',
    ({ value }) => {
      render(<CookingOilAdjustment teaspoons={value} onChange={jest.fn()} />);

      expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      expect(
        screen.queryByRole('spinbutton', { name: 'Teaspoons' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'No cooking oil added'
      );
    }
  );

  it('closes an open custom input when the controlled value becomes invalid', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(
      <CookingOilAdjustment teaspoons={0} onChange={onChange} />
    );

    await user.click(screen.getByRole('button', { name: 'Custom' }));
    expect(
      screen.getByRole('spinbutton', { name: 'Teaspoons' })
    ).toBeInTheDocument();

    rerender(
      <CookingOilAdjustment
        teaspoons={Number.POSITIVE_INFINITY}
        onChange={onChange}
      />
    );

    expect(
      screen.queryByRole('spinbutton', { name: 'Teaspoons' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No cooking oil added'
    );
  });
});
