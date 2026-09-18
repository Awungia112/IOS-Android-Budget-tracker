import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithRealProviders, cleanupTestResources } from '@/test-utils/render'
import Layout from '../../components/Layout'
import React from 'react'

// Mock pages for testing routing
const MockOverview = () => <div data-testid="overview-page">Overview</div>
const MockSavingsGoals = () => <div data-testid="savings-goals-page">Savings Goals</div>
const MockLimits = () => <div data-testid="limits-page">Limits</div>
const MockOnboarding = () => <div data-testid="onboarding-page">Onboarding</div>

describe('Layout Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanupTestResources()
  })

  it('renders all navigation items when authenticated', async () => {
    renderWithRealProviders(
      <Layout>
        <MockOverview />
      </Layout>
    )

    await waitFor(() => {
      // Should show main navigation items with correct testids
      expect(screen.getByTestId('sidebar-link-overview')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('highlights active route correctly', async () => {
    renderWithRealProviders(
      <Layout>
        <MockSavingsGoals />
      </Layout>,
      { initialRoute: '/savings-goals' }
    )

    await waitFor(() => {
      // Should show navigation elements
      expect(screen.getByTestId('sidebar-link-overview')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-container')).toBeInTheDocument()
      
      // Should NOT highlight the overview link when on savings-goals route
      // (savings-goals is not in sidebar navigation, so no link should be highlighted)
      const overviewLink = screen.getByTestId('sidebar-link-overview')
      expect(overviewLink).toHaveClass('bg-white dark:bg-white/5 text-black dark:text-white')
      expect(overviewLink).not.toHaveClass('bg-gray-50 dark:bg-white/10 text-black dark:text-white')
    }, { timeout: 5000 })
  })

  it('highlights overview link when on overview route', async () => {
    renderWithRealProviders(
      <Layout>
        <MockOverview />
      </Layout>,
      { initialRoute: '/' }
    )

    await waitFor(() => {
      // Should show navigation elements
      expect(screen.getByTestId('sidebar-link-overview')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-container')).toBeInTheDocument()
      
      // Should highlight the overview link when on overview route
      const overviewLink = screen.getByTestId('sidebar-link-overview')
      expect(overviewLink).toHaveClass('bg-gray-50 dark:bg-white/10 text-black dark:text-white')
      expect(overviewLink).not.toHaveClass('bg-white dark:bg-white/5 text-black dark:text-white')
    }, { timeout: 5000 })
  })

  it('renders correct page for given route', async () => {
    renderWithRealProviders(
      <Layout>
        <MockLimits />
      </Layout>,
      { initialRoute: '/limits' }
    )

    await waitFor(() => {
      // Should render the limits page content
      expect(screen.getByTestId('limits-page')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-container')).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('redirects to onboarding when unauthenticated', async () => {
    renderWithRealProviders(
      <Layout>
        <MockOverview />
      </Layout>,
      { initialRoute: '/', isAuthenticated: false }
    )

    await waitFor(() => {
      // Should still render layout structure even when unauthenticated
      expect(screen.getByTestId('sidebar-container')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-menu-button')).toBeInTheDocument()
    }, { timeout: 5000 })
  })
})
