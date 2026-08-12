import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/toast';
import { SettingsForm } from './settings-form';
import { UPGRADE_REQUIRED } from '@/lib/client';

const refresh = vi.fn();
const lpCall = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/client', () => ({
  UPGRADE_REQUIRED: 402,
  lpCall: (...args: unknown[]) => lpCall(...args),
}));

const tenant = {
  id: 'tenant_1',
  name: 'PrintPro Lanka',
  currency: 'LKR',
  countryCode: 'LK',
  vatNumber: null,
  autoSend: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('SettingsForm', () => {
  beforeEach(() => {
    refresh.mockReset();
    lpCall.mockReset();
  });

  it('disables auto-send on Starter and explains why', () => {
    render(
      <ToastProvider>
        <SettingsForm tenant={tenant} autoSendAvailable={false} planName="Starter" />
      </ToastProvider>,
    );

    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText(/not included in the starter plan/i)).toBeInTheDocument();
  });

  it('shows an upgrade toast when auto-send is rejected with 402', async () => {
    lpCall.mockResolvedValueOnce({
      ok: false,
      status: UPGRADE_REQUIRED,
      data: null,
      error: 'Automatic sending is not part of the Starter plan.',
    });

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SettingsForm tenant={tenant} autoSendAvailable={true} planName="Growth" />
      </ToastProvider>,
    );

    const checkbox = screen.getByRole('checkbox', { name: /send payment reminders automatically/i });
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(document.body).toHaveTextContent(/automatic sending/i);
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
