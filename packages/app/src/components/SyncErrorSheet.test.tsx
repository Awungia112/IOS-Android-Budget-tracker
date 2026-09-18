/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const mockGetLastError = vi.fn();
const mockGetLastErrorStatus = vi.fn();
const mockTriggerSync = vi.fn();
const mockGoOnline = vi.fn();
const mockLogout = vi.fn();

vi.mock('@budget/core', () => ({
  syncEngine: {
    getLastError: () => mockGetLastError(),
    getLastErrorStatus: () => mockGetLastErrorStatus(),
  },
}));

vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    triggerSync: mockTriggerSync,
    goOnline: mockGoOnline,
    isOfflineMode: false,
  }),
}));

vi.mock('@/contexts/AccountContext', () => ({
  useAccount: () => ({
    logout: mockLogout,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

import { SyncErrorSheet } from './SyncErrorSheet';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SyncErrorSheet', () => {
  it('shows the session-expired message when the last sync error was a 401', () => {
    mockGetLastError.mockReturnValue('Online accounts request failed with HTTP 401');
    mockGetLastErrorStatus.mockReturnValue(401);

    render(<SyncErrorSheet {...defaultProps} />);

    expect(screen.getByText('session_expired_sign_in_again')).toBeInTheDocument();
    expect(
      screen.queryByText('Online accounts request failed with HTTP 401'),
    ).not.toBeInTheDocument();
  });

  it('signs the user out instead of retrying when the session expired', () => {
    mockGetLastErrorStatus.mockReturnValue(401);
    render(<SyncErrorSheet {...defaultProps} />);

    const actionButton = screen.getByText('session_expired_sign_in_action');
    fireEvent.click(actionButton);

    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockTriggerSync).not.toHaveBeenCalled();
  });

  it('retries sync for non-401 failures', () => {
    mockGetLastErrorStatus.mockReturnValue(undefined);
    render(<SyncErrorSheet {...defaultProps} />);

    const actionButton = screen.getByText('sync.retry');
    fireEvent.click(actionButton);

    expect(mockTriggerSync).toHaveBeenCalledOnce();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('shows the raw error message for non-401 failures', () => {
    mockGetLastError.mockReturnValue('Network timeout');
    mockGetLastErrorStatus.mockReturnValue(undefined);

    render(<SyncErrorSheet {...defaultProps} />);

    expect(screen.getByText('Network timeout')).toBeInTheDocument();
  });

  it('falls back to a default message when no error is recorded', () => {
    mockGetLastError.mockReturnValue(undefined);
    mockGetLastErrorStatus.mockReturnValue(undefined);

    render(<SyncErrorSheet {...defaultProps} />);

    expect(screen.getByText('Unknown sync error')).toBeInTheDocument();
  });
});