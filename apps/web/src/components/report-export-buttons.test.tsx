import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/toast';
import { ReportExportButtons } from './report-export-buttons';
import { UPGRADE_REQUIRED } from '@/lib/client';

describe('ReportExportButtons', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an upgrade toast when export returns 402', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'Report exports is not part of the Starter plan.' }), {
          status: UPGRADE_REQUIRED,
        }),
      ),
    );

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ReportExportButtons />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/report exports/i);
      expect(document.body).toHaveTextContent('View plans');
    });
  });
});
