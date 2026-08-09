'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { UPGRADE_REQUIRED, lpCall } from './client';

interface RunOptions {
  method?: string;
  body?: unknown;
  /** Toast shown when the call succeeds. */
  success?: string;
  /** Refresh server components so the new state appears. Defaults to true. */
  refresh?: boolean;
  onSuccess?: (data: unknown) => void;
}

/**
 * Shared plumbing for the dashboard's action buttons: tracks which action is
 * in flight, surfaces the result as a toast, and refreshes the route on success
 * instead of doing a full page reload.
 *
 * A 402 from the API means the tenant's plan does not allow the action, so it
 * becomes an upgrade prompt rather than an error.
 */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function run(key: string, path: string, options: RunOptions = {}): Promise<boolean> {
    const { method = 'POST', body, success, refresh = true, onSuccess } = options;

    setPendingKey(key);
    const result = await lpCall(path, { method, body });
    setPendingKey(null);

    if (!result.ok) {
      if (result.status === UPGRADE_REQUIRED) {
        toast.upgrade(result.error ?? 'Your plan does not include this.');
      } else {
        toast.error(result.error ?? 'Something went wrong.');
      }
      return false;
    }

    if (success) toast.success(success);
    onSuccess?.(result.data);
    if (refresh) router.refresh();
    return true;
  }

  return {
    run,
    pendingKey,
    isPending: (key: string) => pendingKey === key,
    busy: pendingKey !== null,
  };
}
