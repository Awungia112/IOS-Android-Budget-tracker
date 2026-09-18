/**
 * @vitest-environment jsdom
 *
 * Integration tests — migration entry point in Settings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderIntegration } from '@/test-utils/integration-render';
import Settings from '@/pages/Settings';

describe('Settings — migration CTA', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('does not render the migration banner when migration is pending', async () => {
    renderIntegration(<Settings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-migration-row')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('settings-migration-banner')).not.toBeInTheDocument();
  });

  it('keeps the migration row available after migration is completed', async () => {
    renderIntegration(<Settings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-migration-row')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('settings-migration-banner')).not.toBeInTheDocument();
  });
});
