import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ToastProvider } from '@/components/toast';
import { UPGRADE_REQUIRED } from './client';

const refresh = vi.fn();
const lpCall = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('./client', () => ({
  UPGRADE_REQUIRED: 402,
  lpCall: (...args: unknown[]) => lpCall(...args),
}));

import { useAction } from './use-action';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('useAction', () => {
  beforeEach(() => {
    refresh.mockReset();
    lpCall.mockReset();
  });

  it('shows an upgrade toast on 402', async () => {
    lpCall.mockResolvedValueOnce({
      ok: false,
      status: UPGRADE_REQUIRED,
      data: null,
      error: 'The compliance agent is not part of the Starter plan.',
    });

    const { result } = renderHook(() => useAction(), { wrapper });

    let ok = false;
    await act(async () => {
      ok = await result.current.run('test', '/agent-runs', { body: { agentType: 'COMPLIANCE' } });
    });

    expect(ok).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.body).toHaveTextContent(/compliance agent/i);
      expect(document.body).toHaveTextContent('View plans');
    });
  });

  it('shows an error toast and skips refresh on other failures', async () => {
    lpCall.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: null,
      error: 'Something broke.',
    });

    const { result } = renderHook(() => useAction(), { wrapper });

    await act(async () => {
      await result.current.run('save', '/customers', { method: 'POST', body: { name: 'A' } });
    });

    expect(refresh).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.body).toHaveTextContent('Something broke.');
    });
  });

  it('refreshes the route after a successful mutation by default', async () => {
    lpCall.mockResolvedValueOnce({ ok: true, status: 200, data: { ok: true }, error: null });

    const { result } = renderHook(() => useAction(), { wrapper });

    let ok = false;
    await act(async () => {
      ok = await result.current.run('save', '/customers', {
        method: 'POST',
        body: { name: 'Kamal' },
        success: 'Customer added.',
      });
    });

    expect(ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(document.body).toHaveTextContent('Customer added.');
    });
  });

  it('tracks pending state per action key', async () => {
    let resolveCall!: (value: unknown) => void;
    lpCall.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCall = resolve;
      }),
    );

    const { result } = renderHook(() => useAction(), { wrapper });

    act(() => {
      void result.current.run('approve:run_1', '/agent-runs/run_1/approve');
    });

    expect(result.current.isPending('approve:run_1')).toBe(true);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolveCall({ ok: true, status: 200, data: {}, error: null });
    });

    expect(result.current.isPending('approve:run_1')).toBe(false);
  });
});
