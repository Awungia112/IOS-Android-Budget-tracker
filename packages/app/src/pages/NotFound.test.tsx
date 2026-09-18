/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

// Suppress console.error from NotFound's useEffect
vi.spyOn(console, 'error').mockImplementation(() => {});

import NotFound from './NotFound';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter
    initialEntries={['/nonexistent']}
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    {children}
  </MemoryRouter>
);

describe('NotFound Page', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders 404 heading', () => {
    render(
      <TestWrapper>
        <NotFound />
      </TestWrapper>,
    );
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders page not found message', () => {
    render(
      <TestWrapper>
        <NotFound />
      </TestWrapper>,
    );
    expect(screen.getByText('Oops! Page not found')).toBeInTheDocument();
  });

  it('renders a link to home page', () => {
    render(
      <TestWrapper>
        <NotFound />
      </TestWrapper>,
    );
    const link = screen.getByRole('link', { name: /return to home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });
});
