import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'web',
    isNativePlatform: () => false,
  },
  registerPlugin: vi.fn().mockReturnValue({}),
}));

// Mock Sentry
vi.mock('@sentry/capacitor', () => ({
  captureException: vi.fn(),
}));

// Import the ErrorBoundary class from App for isolated testing
import { ErrorBoundary } from './App';

describe('App ErrorBoundary', () => {
  beforeEach(() => {
    // Reset window.location before each test
    delete (window as any).location;
    (window as any).location = { reload: vi.fn() };

    // Mock APP_VERSION
    (global as any).APP_VERSION = '4.4.0';
  });

  it('should render ErrorBoundary with support link when error occurs', () => {
    // Create a component that throws an error
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    // Check that ErrorBoundary renders
    expect(screen.getByText('Verbindungsproblem')).toBeInTheDocument();
    expect(screen.getByText('Wir hatten Probleme beim Laden dieses Teils der App. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.')).toBeInTheDocument();

    // Check that support link has correct data-testid
    const supportLink = screen.getByTestId('app-error-contact-support');
    expect(supportLink).toBeInTheDocument();
    expect(supportLink).toHaveTextContent('Support kontaktieren');

    // Check that mailto link contains correct support email
    const href = supportLink.getAttribute('href') ?? '';
    expect(href).toMatch(/^mailto:mobilebudget@deutschland-im-plus\.de/);
    expect(href).toContain(encodeURIComponent('[App-Fehler] Verbindungsproblem'));
    expect(href).toContain(encodeURIComponent('App-Version: 4.4.0'));
    expect(href).toContain(encodeURIComponent('Plattform: web'));
  });
});
