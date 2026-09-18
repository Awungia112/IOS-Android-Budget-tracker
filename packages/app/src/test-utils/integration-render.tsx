/**
 * Integration test render helper
 *
 * Wraps components in REAL BudgetProvider (backed by fake-indexeddb)
 * plus mocked AccountContext, ThemeContext, and a Toaster so toast
 * feedback is visible in the DOM.
 *
 * Usage:
 *   renderIntegration(<TransactionForm type="expense" onSave={fn} onCancel={fn} />)
 */

import { render, RenderOptions } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReactElement, useState } from 'react'
import React from 'react'

import { ThemeProviderContext } from '../contexts/ThemeContext'
import { AccountContext } from '../contexts/AccountContext'
import { BudgetProvider } from '../contexts/BudgetContext'
import { MigrationDrawerProvider } from '../contexts/MigrationDrawerContext'
import { PendingInvitesProvider } from '../contexts/PendingInvitesContext'
import { Toaster } from '../components/ui/toaster'
import { TooltipProvider } from '../components/ui/tooltip'

import type { AccountContextType } from '../contexts/AccountContext'

// --- AccountContext mock (static — no real auth needed) ---
const mockAccountValue: AccountContextType = {
    isAuthenticated: true,
    setIsAuthenticated: vi.fn(),
    isLoggedIn: false,
    setIsLoggedIn: vi.fn(),
    logout: vi.fn(),
    resetOnboarding: vi.fn(),
}

// --- ThemeContext mock ---
const mockThemeValue = {
    theme: 'light' as const,
    setTheme: vi.fn(),
}

const createTestQueryClient = () => new QueryClient({
    defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
    },
})

interface IntegrationRenderOptions extends Omit<RenderOptions, 'wrapper'> {
    /** Initial route entries for MemoryRouter, e.g. ['/limits/edit/limit-1'] */
    initialEntries?: string[]
    /** Route path pattern, e.g. '/limits/edit/:limitId' */
    routePath?: string
}

/**
 * Render a component inside the real BudgetProvider stack.
 *
 * BudgetProvider is async — callers must await provider init before
 * interacting:
 *
 *   await waitFor(() => expect(screen.getByRole('button', ...)).toBeInTheDocument())
 */
export const renderIntegration = (
    ui: ReactElement,
    { initialEntries = ['/'], routePath, ...options }: IntegrationRenderOptions = {},
) => {
    const queryClient = createTestQueryClient()

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter
            initialEntries={initialEntries}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
            <QueryClientProvider client={queryClient}>
                <AccountContext.Provider value={mockAccountValue}>
                    <PendingInvitesProvider>
                        <BudgetProvider>
                            <MigrationDrawerProvider>
                                <ThemeProviderContext.Provider value={mockThemeValue}>
                                    <TooltipProvider>
                                        {routePath ? (
                                            <Routes>
                                                <Route path={routePath} element={children} />
                                                <Route path="*" element={null} />
                                            </Routes>
                                        ) : (
                                            children
                                        )}
                                        {/* NOTE: when using routePath, ensure initialEntries[0] matches the pattern exactly */}
                                        <Toaster />
                                    </TooltipProvider>
                                </ThemeProviderContext.Provider>
                            </MigrationDrawerProvider>
                        </BudgetProvider>
                    </PendingInvitesProvider>
                </AccountContext.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    )

    return render(ui, { wrapper: Wrapper, ...options })
}

export * from '@testing-library/react'

/**
 * Wrapper component for use with renderHook in integration tests.
 * Uses the same provider stack as renderIntegration but accepts no routing options.
 */
export const AllProviders = ({ children }: { children: React.ReactNode }) => {
    const [queryClient] = useState(() => createTestQueryClient())

    return (
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <QueryClientProvider client={queryClient}>
                <AccountContext.Provider value={mockAccountValue}>
                    <PendingInvitesProvider>
                        <BudgetProvider>
                            <MigrationDrawerProvider>
                                <ThemeProviderContext.Provider value={mockThemeValue}>
                                    <TooltipProvider>
                                        {children}
                                        <Toaster />
                                    </TooltipProvider>
                                </ThemeProviderContext.Provider>
                            </MigrationDrawerProvider>
                        </BudgetProvider>
                    </PendingInvitesProvider>
                </AccountContext.Provider>
            </QueryClientProvider>
        </MemoryRouter>
    )
}
