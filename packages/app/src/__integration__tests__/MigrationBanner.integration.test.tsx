/**
 * @vitest-environment jsdom
 *
 * Integration tests — migration banner removal from the Overview page.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderIntegration } from '@/test-utils/integration-render';
import Index from '@/pages/Index';

describe('Overview — migration banner', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('does not render the migration banner when migration is pending', async () => {
    renderIntegration(<Index />);
    await waitFor(() => {
      expect(screen.getByTestId('main-date-picker-button')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('migration-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('migration-banner-cta')).not.toBeInTheDocument();
  });

  it('does not render the migration banner after migration is completed', async () => {
    renderIntegration(<Index />);
    await waitFor(() => {
      expect(screen.getByTestId('main-date-picker-button')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('migration-banner')).not.toBeInTheDocument();
  });
});
