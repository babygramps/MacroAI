import { render, screen, fireEvent } from '@testing-library/react';
import { DayStatusAction } from '@/components/ui/DayStatusAction';

// Mock the server action
jest.mock('@/actions/updateDayStatus', () => ({
  updateDayStatus: jest.fn().mockResolvedValue({ success: true, logStatus: 'complete' }),
}));

// Mock the Toast
jest.mock('@/components/ui/Toast', () => ({
  showToast: jest.fn(),
}));

describe('DayStatusAction', () => {
  const mockOnStatusChange = jest.fn();
  
  // Create a past date (yesterday) for testing status display
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  
  // Today at 9 PM to trigger end-of-day prompts
  const todayLate = new Date();
  todayLate.setHours(21, 0, 0, 0);
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock time to be after 8 PM for "late in day" logic
    jest.useFakeTimers();
    jest.setSystemTime(todayLate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing for today when day already has complete status', () => {
    const { container } = render(
      <DayStatusAction
        selectedDate={todayLate}
        currentStatus="complete"
        totalCalories={2000}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    // For today with status, component returns null to avoid confusion
    expect(container.firstChild).toBeNull();
  });

  it('shows complete status indicator for past days', () => {
    render(
      <DayStatusAction
        selectedDate={yesterday}
        currentStatus="complete"
        totalCalories={2000}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText('Day Complete')).toBeInTheDocument();
    expect(screen.getByText('Included in TDEE calculations')).toBeInTheDocument();
  });

  it('shows skipped status indicator for past days', () => {
    render(
      <DayStatusAction
        selectedDate={yesterday}
        currentStatus="skipped"
        totalCalories={0}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText('Day Skipped')).toBeInTheDocument();
    expect(screen.getByText('Excluded from TDEE calculations')).toBeInTheDocument();
  });

  it('shows prompt for low calories today', () => {
    render(
      <DayStatusAction
        selectedDate={todayLate}
        currentStatus={null}
        totalCalories={800}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText(/Only 800 kcal logged/)).toBeInTheDocument();
  });

  it('shows Mark Day Skipped button for today when prompted', () => {
    render(
      <DayStatusAction
        selectedDate={todayLate}
        currentStatus={null}
        totalCalories={800}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    // For today, shows simplified "Mark Day Skipped" button
    expect(screen.getByText('Mark Day Skipped')).toBeInTheDocument();
  });

  it('shows options for past days when Mark Day Skipped is clicked', () => {
    render(
      <DayStatusAction
        selectedDate={yesterday}
        currentStatus={null}
        totalCalories={0}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    // Click the button to show options
    fireEvent.click(screen.getByText('Mark Day Skipped'));
    
    expect(screen.getByText('Mark as Complete')).toBeInTheDocument();
    expect(screen.getByText('Skip Day (Exclude from TDEE)')).toBeInTheDocument();
  });

  it('allows changing status from complete on past days', () => {
    render(
      <DayStatusAction
        selectedDate={yesterday}
        currentStatus="complete"
        totalCalories={2000}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    // Click "Change" button
    expect(screen.getByText('Change')).toBeInTheDocument();
  });
});
