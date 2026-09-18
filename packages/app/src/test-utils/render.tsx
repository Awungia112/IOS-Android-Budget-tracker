import React, { ReactElement, useMemo } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import { ThemeProviderContext, ThemeProvider } from '../contexts/ThemeContext'
import { BudgetContext, BudgetProvider } from '../contexts/BudgetContext'
import { AccountContext, AccountProvider } from '../contexts/AccountContext'
import { MigrationDrawerProvider } from '../contexts/MigrationDrawerContext'
import { PendingInvitesProvider } from '../contexts/PendingInvitesContext'
import { TooltipProvider } from '../components/ui/tooltip'
import type { BudgetContextType } from '../contexts/BudgetContext'
import type { AccountContextType } from '../contexts/AccountContext'

// Global query client instance for cleanup
let queryClient: QueryClient | null = null

// Cleanup function for test resources
export const cleanupTestResources = () => {
  if (queryClient) {
    queryClient.clear()
    queryClient = null
  }
  localStorage.clear()
}

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Cleanup function for test isolation
const cleanupQueryClient = (client: QueryClient) => {
  try {
    // Clean up QueryClient
    client?.clear();
  } catch (error) {
    console.warn("Failed to cleanup QueryClient:", error);
  }
};

// --- AccountContext mock factory ---
export const createMockAccountValue = (): AccountContextType => ({
    isAuthenticated: true,
    setIsAuthenticated: vi.fn(),
    isLoggedIn: false,
    setIsLoggedIn: vi.fn(),
    logout: vi.fn(),
    resetOnboarding: vi.fn(),
})

// --- ThemeContext mock factory ---
export const createMockThemeValue = () => ({
    theme: 'light' as const,
    setTheme: vi.fn(),
})

// --- BudgetContext mock factory ---
export const createMockBudgetValue = (): BudgetContextType => ({
    // Accounts
    currentAccount: {
        id: 'main-account',
        name: 'Test Account',
        initials: 'TA',
    },
    accounts: [],
    switchAccount: vi.fn(),
    addAccount: vi.fn(),
    deleteAccount: vi.fn(),
    updateAccount: vi.fn(),
    getAccountBalances: vi.fn().mockResolvedValue({}),

  // Transactions
  transactions: [],
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),

  // Categories
  categories: [],
  addCategory: vi.fn(),
  deleteCategory: vi.fn(),
  updateCategory: vi.fn(),

  // Limits
  limits: [],
  addLimit: vi.fn(),
  updateLimit: vi.fn(),
  deleteLimit: vi.fn(),

  // Templates
  templates: [],
  addTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  applyTemplate: vi.fn(),

  // Recurring Items
  recurringItems: [],
  addRecurringItem: vi.fn(),
  updateRecurringItem: vi.fn(),
  deleteRecurringItem: vi.fn(),

  // Savings Goals
  savingsGoals: [],
  addSavingsGoal: vi.fn(),
  updateSavingsGoal: vi.fn(),
  deleteSavingsGoal: vi.fn(),

  // App Functions
  resetApp: vi.fn(),
  isLoading: false,

  // Export/Import
  exportAccountData: vi.fn(),
  importAccountData: vi.fn(),

  // Settings
  isOfflineMode: false,
  setIsOfflineMode: vi.fn(),
  goOffline: vi.fn(),
  goOnline: vi.fn(),
  requestGoOnline: vi.fn(),
  requestRestoreOnlineAccounts: vi.fn(),
  isNetworkOnline: true,

    // Pending Transactions
    executePendingTransactionsNow: vi.fn(),

    // Notifications
    missedNotifications: [],
    dismissMissedNotifications: vi.fn(),
    triggerSync: vi.fn(),
    provisionSharedAccount: vi.fn().mockResolvedValue({ success: true }),
   refreshFromDb: vi.fn().mockResolvedValue(undefined),
   deleteOnlineAccount: vi.fn().mockResolvedValue(undefined),
})

/**
 * Unified provider wrapper that supports both real and mocked providers
 */
const createProviderWrapper = (
  useRealProviders: boolean = true,
  customQueryClient?: QueryClient,
) => {
  const queryClient = customQueryClient || createTestQueryClient();

  if (useRealProviders) {
    return ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="light" storageKey="budget-wise-theme">
            <AccountProvider>
              <PendingInvitesProvider>
                <BudgetProvider>
                  <MigrationDrawerProvider>{children}</MigrationDrawerProvider>
                </BudgetProvider>
              </PendingInvitesProvider>
            </AccountProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <AccountContext.Provider value={createMockAccountValue()}>
          <BudgetContext.Provider value={createMockBudgetValue()}>
            <ThemeProviderContext.Provider value={createMockThemeValue()}>
              <PendingInvitesProvider>
                <MigrationDrawerProvider>{children}</MigrationDrawerProvider>
              </PendingInvitesProvider>
            </ThemeProviderContext.Provider>
          </BudgetContext.Provider>
        </AccountContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

/**
 * AllProviders component for general testing (from develop branch)
 * Generates fresh mock instances per provider mount to prevent cross-test state leakage
 */
export const AllProviders = ({ children }: { children: React.ReactNode }) => {
    // Generate fresh mock instances per provider mount to prevent cross-test state leakage
    const accountValue = useMemo(() => createMockAccountValue(), [])
    const budgetValue = useMemo(() => createMockBudgetValue(), [])
    const themeValue = useMemo(() => createMockThemeValue(), [])
    const queryClient = useMemo(() => createTestQueryClient(), [])

    return (
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <QueryClientProvider client={queryClient}>
                <AccountContext.Provider value={accountValue}>
<BudgetContext.Provider value={budgetValue}>
                    <ThemeProviderContext.Provider value={themeValue}>
                        <PendingInvitesProvider>
                          <TooltipProvider>
                            <MigrationDrawerProvider>{children}</MigrationDrawerProvider>
                          </TooltipProvider>
                        </PendingInvitesProvider>
                    </ThemeProviderContext.Provider>
                </BudgetContext.Provider>
                </AccountContext.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    )
}

/**
 * Render components with all the real providers (BudgetContext, AccountContext, ThemeContext)
 * This is used for integration tests that need to test the wiring between providers and consumers.
 */
export const renderWithProviders = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) => {
  const queryClient = createTestQueryClient();
  const Wrapper = createProviderWrapper(true, queryClient);

  const result = render(ui, { wrapper: Wrapper, ...options });
  
  // Return cleanup function for proper test isolation
  return {
    ...result,
    cleanup: () => {
      result.unmount();
      cleanupQueryClient(queryClient);
    },
  };
};

/**
 * Render components with all mocked providers for unit tests
 * This provides fully mocked contexts for isolated unit testing.
 */
export const renderWithMockedProviders = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) => {
  const Wrapper = createProviderWrapper(false);
  return render(ui, { wrapper: Wrapper, ...options });
};

// Integration test render function that uses real BudgetProvider
export const renderWithRealProviders = (
    ui: ReactElement,
    options: {
        initialRoute?: string
        isAuthenticated?: boolean
        renderOptions?: Omit<RenderOptions, 'wrapper'>
    } = {}
) => {
    const {
        initialRoute = '/',
        isAuthenticated = true,
        renderOptions = {}
    } = options

    // Clean up previous query client if exists
    if (queryClient) {
        queryClient.clear()
    }

    queryClient = new QueryClient({
        defaultOptions: {
            queries: { 
                retry: false, 
                staleTime: 0,
                gcTime: 0,
            },
            mutations: { retry: false },
        },
    })

    const newQueryClient = queryClient

    const accountValue = {
        ...createMockAccountValue(),
        isAuthenticated,
    }

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter initialEntries={[initialRoute]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <QueryClientProvider client={newQueryClient}>
                <AccountContext.Provider value={accountValue}>
                    <PendingInvitesProvider>
                        <BudgetProvider>
                            <ThemeProviderContext.Provider value={createMockThemeValue()}>
                                <TooltipProvider>
                                    <MigrationDrawerProvider>{children}</MigrationDrawerProvider>
                                </TooltipProvider>
                            </ThemeProviderContext.Provider>
                        </BudgetProvider>
                    </PendingInvitesProvider>
                </AccountContext.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    )

    return render(ui, { wrapper, ...renderOptions })
}

// Re-export everything from testing-library/react
export * from "@testing-library/react"
