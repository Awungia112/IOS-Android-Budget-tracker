import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, act } from '@testing-library/react'
import { useBudget } from '@/contexts/BudgetContext'
import { renderWithRealProviders, cleanupTestResources } from '@/test-utils/render'
import SavingsGoals from '../../pages/SavingsGoals'
import React from 'react'

describe('SavingsGoals Simple Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanupTestResources()
  })

  it('renders empty state initially', async () => {
    renderWithRealProviders(<SavingsGoals />)

    await waitFor(() => {
      // Should show empty state when no goals
      expect(screen.getByTestId('savings-goals-empty')).toBeInTheDocument()
      expect(screen.getByTestId('savings-goals-add-button')).toBeInTheDocument()
      
      // Should not show any goal cards
      expect(screen.queryAllByTestId(/savings-goal-card-/)).toHaveLength(0)
    }, { timeout: 5000 })
  })

  it('seeds and displays a savings goal', async () => {
    const user = userEvent.setup()

    const TestComponent = () => {
      const { addSavingsGoal } = useBudget()
      
      const handleSeed = async () => {
        try {
          await addSavingsGoal({
            name: 'Test Goal',
            targetAmount: 1000,
            deadline: '2026-12-01',
          })
        } catch (error) {
          console.error('Seed failed:', error)
        }
      }

      return (
        <div>
          <button onClick={handleSeed} data-testid="seed-button">
            Seed Goal
          </button>
          <SavingsGoals />
        </div>
      )
    }

    renderWithRealProviders(<TestComponent />)

    // Wait for seed button to be available
    await waitFor(() => {
      expect(screen.getByTestId('seed-button')).toBeInTheDocument()
    }, { timeout: 3000 })

    await user.click(screen.getByTestId('seed-button'))

    await waitFor(() => {
      // Look for savings goal cards
      const goalCards = screen.queryAllByTestId(/savings-goal-card-/)
      expect(goalCards.length).toBeGreaterThan(0)
      
      // Verify the seeded goal name appears
      expect(screen.getByText('Test Goal')).toBeInTheDocument()
      
      // Empty state should not be shown
      expect(screen.queryByTestId('savings-goals-empty')).not.toBeInTheDocument()
    }, { timeout: 10000 })
  })
})
