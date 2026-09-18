/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react/pure';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock navigation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        about_budget_wise: 'Mein Budget App',
        about_budget_wise_description: 'The Mein Budget App helps you keep track of your finances - secure, simple and local on your device.',
        about_deutschland_im_plus: 'About Deutschland im Plus',
        about_deutschland_im_plus_description: 'Deutschland im Plus is a foundation.',
        contact_information: 'Contact Information',
        website: 'Website',
        app_information: 'App Information',
        version: 'Version',
        copyright: 'Copyright',
        legal_notice: 'Legal Notice',
        legal_notice_description: 'All rights reserved.',
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: { language: 'en' },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// Mock BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    accounts: [{ id: '1', name: 'Test' }],
    currentAccount: { id: '1', name: 'Test' },
    switchAccount: vi.fn(),
    isLoading: false,
    isOfflineMode: false,
    setIsOfflineMode: vi.fn(),
    missedNotifications: [],
    dismissMissedNotifications: vi.fn(),
  }),
}));

// Mock AccountContext
vi.mock('@/contexts/AccountContext', () => ({
  useAccount: () => ({
    logout: vi.fn(),
    isAuthenticated: true,
    setIsAuthenticated: vi.fn(),
    resetOnboarding: vi.fn(),
  }),
}));

vi.mock('@/contexts/PendingInvitesContext', () => ({
  usePendingInvites: () => ({
    pendingInvites: [],
    isLoading: false,
    error: null,
    fetchPendingInvites: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    pendingCount: 0,
    acceptingInviteId: null,
    decliningInviteId: null,
  }),
  PendingInvitesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import About from './About';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);

describe('About Page', () => {
  beforeAll(() => {
    render(
      <TestWrapper>
        <About />
      </TestWrapper>,
    );
  });

  afterAll(() => {
    cleanup();
  });

  it('renders the about heading', () => {
    expect(screen.getByText('Mein Budget App')).toBeInTheDocument();
  });

  it('renders the app description', () => {
    expect(screen.getByText('The Mein Budget App helps you keep track of your finances - secure, simple and local on your device.')).toBeInTheDocument();
  });

  it('renders Deutschland im Plus section', () => {
    expect(screen.getByText('About Deutschland im Plus')).toBeInTheDocument();
    expect(screen.getByText('Deutschland im Plus is a foundation.')).toBeInTheDocument();
  });

  it('displays contact information', () => {
    expect(screen.getByText('Contact Information:')).toBeInTheDocument();
    expect(screen.getByText(/Beuthener Str. 25/)).toBeInTheDocument();
    expect(screen.getByText(/90471 Nürnberg/)).toBeInTheDocument();
  });

  it('renders the website link', () => {
    const link = screen.getByRole('link', { name: /deutschland-im-plus.de/i });
    expect(link).toHaveAttribute('href', 'https://www.deutschland-im-plus.de');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('displays app version and copyright', () => {
    expect(screen.getByText('App Information')).toBeInTheDocument();
    // Match any semver version string rather than hardcoding a specific version
    expect(screen.getAllByText(/\d+\.\d+\.\d+/).length).toBeGreaterThan(0);
    expect(screen.getByText(/© \d{4} Deutschland im Plus/)).toBeInTheDocument();
  });
});
