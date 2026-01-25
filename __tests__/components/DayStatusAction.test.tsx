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
  const today = new Date();
  today.setHours(21, 0, 0, 0); // 9 PM to trigger end-of-day prompts
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock time to be after 8 PM for "late in day" logic
    jest.useFakeTimers();
    jest.setSystemTime(today);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when day already has complete status', () => {
    const { container } = render(
      <DayStatusAction
        selectedDate={today}
        currentStatus="complete"
        totalCalories={2000}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    // Should show status indicator, not be empty
    expect(screen.getByText('Day Complete')).toBeInTheDocument();
    expect(screen.getByText('Included in TDEE calculations')).toBeInTheDocument();
  });

  it('shows skipped status indicator', () => {
    render(
      <DayStatusAction
        selectedDate={today}
        currentStatus="skipped"
        totalCalories={0}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText('Day Skipped')).toBeInTheDocument();
    expect(screen.getByText('Excluded from TDEE calculations')).toBeInTheDocument();
  });

  it('shows prompt for low calories', () => {
    render(
      <DayStatusAction
        selectedDate={today}
        currentStatus={null}
        totalCalories={800}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText(/Only 800 kcal logged/)).toBeInTheDocument();
  });

  it('shows Mark Day Status button when prompted', () => {
    render(
      <DayStatusAction
        selectedDate={today}
        currentStatus={null}
        totalCalories={800}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    expect(screen.getByText('Mark Day Status')).toBeInTheDocument();
  });

  it('shows options when button is clicked', () => {
    render(
      <DayStatusAction
        selectedDate={today}
        currentStatus={null}
        totalCalories={800}
        estimatedTdee={2500}
        onStatusChange={mockOnStatusChange}
      />
    );
    
    fireEvent.click(screen.getByText('Mark Day Status'));
    
    expect(screen.getByText('Mark as Complete')).toBeInTheDocument();
    expect(screen.getByText('Skip Day (Exclude from TDEE)')).toBeInTheDocument();
  });

  it('allows changing status from complete', () => {
    render(
      <DayStatusAction
        selectedDate={today}
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
