import { render, screen, fireEvent } from '@testing-library/react';
import { DayStatusBanner } from '@/components/ui/DayStatusBanner';

// Mock the server action
jest.mock('@/actions/updateDayStatus', () => ({
  updateDayStatus: jest.fn().mockResolvedValue({ success: true, logStatus: 'skipped' }),
}));

// Mock the Toast
jest.mock('@/components/ui/Toast', () => ({
  showToast: jest.fn(),
}));

describe('DayStatusBanner', () => {
  const mockOnStatusChange = jest.fn();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing for today', () => {
    const today = new Date();
    const { container } = render(
      <DayStatusBanner
        selectedDate={today}
        currentStatus={null}
        totalCalories={0}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('shows skipped status banner', () => {
    render(
      <DayStatusBanner
        selectedDate={yesterday}
        currentStatus="skipped"
        totalCalories={0}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText('This day was skipped')).toBeInTheDocument();
    expect(screen.getByText(/Excluded from TDEE calculations/)).toBeInTheDocument();
  });

  it('shows complete status banner', () => {
    render(
      <DayStatusBanner
        selectedDate={yesterday}
        currentStatus="complete"
        totalCalories={2200}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText(/Day complete - included in TDEE/)).toBeInTheDocument();
  });

  it('shows warning for no food logged', () => {
    render(
      <DayStatusBanner
        selectedDate={yesterday}
        currentStatus={null}
        totalCalories={0}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText('No food logged for this day')).toBeInTheDocument();
    expect(screen.getByText('Mark Skipped')).toBeInTheDocument();
  });

  it('shows warning for low calories', () => {
    render(
      <DayStatusBanner
        selectedDate={yesterday}
        currentStatus={null}
        totalCalories={800}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText(/Only 800 kcal logged - looks incomplete/)).toBeInTheDocument();
  });

  it('has Mark Skipped button for incomplete days', () => {
    render(
      <DayStatusBanner
        selectedDate={yesterday}
        currentStatus={null}
        totalCalories={0}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );

    expect(screen.getByText('Mark Skipped')).toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    const { container } = render(
      <DayStatusBanner
        selectedDate={yesterday}
        currentStatus={null}
        totalCalories={0}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
        isLoading={true}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows subtle option for days with reasonable calories', () => {
    render(
      <DayStatusBanner
        selectedDate={yesterday}
        currentStatus={null}
        totalCalories={2200}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );

    // Should show the subtle prompt
    expect(screen.getByText(/Didn't log everything/)).toBeInTheDocument();
    expect(screen.getByText('Mark Incomplete')).toBeInTheDocument();
  });
});
