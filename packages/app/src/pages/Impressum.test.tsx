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
        impressum_title: 'Stiftung Deutschland im Plus - Legal Notice',
        address: 'Address',
        contact: 'Contact',
        legal_status: 'Legal Status',
        authorized_representatives: 'Authorized Representatives',
        supervisory_authority: 'Supervisory Authority',
        app_version: 'App Version',
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

import Impressum from './Impressum';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);

describe('Impressum Page', () => {
  beforeAll(() => {
    render(
      <TestWrapper>
        <Impressum />
      </TestWrapper>,
    );
  });

  afterAll(() => {
    cleanup();
  });

  it('renders the legal notice heading', () => {
    expect(screen.getByText('Stiftung Deutschland im Plus - Legal Notice')).toBeInTheDocument();
  });

  it('displays the organization address', () => {
    expect(screen.getByText('Address:')).toBeInTheDocument();
    expect(screen.getByText(/Beuthener Str. 25/)).toBeInTheDocument();
    expect(screen.getByText(/90471 Nürnberg/)).toBeInTheDocument();
  });

  it('displays contact details', () => {
    expect(screen.getByText('Contact:')).toBeInTheDocument();
    expect(screen.getByText(/info@deutschland-im-plus.de/)).toBeInTheDocument();
    expect(screen.getByText(/0911 \/ 9234 950/)).toBeInTheDocument();
  });

  it('displays authorized representatives', () => {
    expect(screen.getByText('Authorized Representatives:')).toBeInTheDocument();
    expect(screen.getByText(/Philipp Blomeyer/)).toBeInTheDocument();
  });

  it('displays supervisory authority', () => {
    expect(screen.getByText('Supervisory Authority:')).toBeInTheDocument();
    expect(screen.getByText(/Regierung von Mittelfranken/)).toBeInTheDocument();
  });

  it('displays app version', () => {
    expect(screen.getByText('App Version:')).toBeInTheDocument();
    // Match any semver version string rather than hardcoding a specific version
    expect(screen.getAllByText(/\d+\.\d+\.\d+/).length).toBeGreaterThan(0);
  });
});
