import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { useTranslation } from 'react-i18next';
import { AddGoalCard } from './AddGoalCard';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

describe('AddGoalCard', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders add goal card with correct styling', () => {
    render(<AddGoalCard onClick={mockOnClick} />);
    
    // Should show add goal text
    expect(screen.getByText('savingsGoals.addGoal')).toBeInTheDocument();
    
    // Should show plus icon
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles click event', () => {
    render(<AddGoalCard onClick={mockOnClick} />);
    
    const card = screen.getByRole('button');
    fireEvent.click(card);
    
    expect(mockOnClick).toHaveBeenCalled();
  });

  it('has correct accessibility attributes', () => {
    render(<AddGoalCard onClick={mockOnClick} />);
    
    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('aria-label', 'savingsGoals.addGoal');
  });

  it('applies correct styling classes', () => {
    render(<AddGoalCard onClick={mockOnClick} />);
    
    const card = screen.getByRole('button');
    
    // Should have rounded corners
    expect(card).toHaveClass('rounded-[8px]');
    
    // Should have shadow
    expect(card).toHaveClass('shadow-sm');
    
    // Should have transition
    expect(card).toHaveClass('transition-all');
  });

  it('displays icon with correct styling', () => {
    render(<AddGoalCard onClick={mockOnClick} />);
    
    // Should show the plus icon SVG
    const icon = screen.getByRole('button').querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('has correct layout structure', () => {
    render(<AddGoalCard onClick={mockOnClick} />);
    
    // Should have flex column layout (square)
    const card = screen.getByRole('button');
    expect(card).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center');
  });

  it('has correct dimensions', () => {
    render(<AddGoalCard onClick={mockOnClick} />);
    
    const card = screen.getByRole('button');
    
    // Should have fixed height 200px (square)
    expect(card).toHaveStyle('height: 200px');
    
    // Should take full width
    expect(card).toHaveClass('w-full');
  });

  it('shows text with correct styling', () => {
    render(<AddGoalCard onClick={mockOnClick} />);
    
    const text = screen.getByText('savingsGoals.addGoal');
    
    // Should have correct classes for color and medium font weight
    expect(text).toHaveClass('font-semibold', 'text-black', 'dark:text-white');
  });
});