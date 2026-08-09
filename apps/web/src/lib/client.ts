/** Browser-side calls to the API, routed through the authenticated proxy. */

export const UPGRADE_REQUIRED = 402;

export interface CallResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Human-readable failure reason, safe to show in a toast. */
  error: string | null;
}

function messageFrom(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  return `Request failed (${status})`;
}

/**
 * Calls the API through /api/lp. Never throws — callers branch on `ok` and on
 * `status === UPGRADE_REQUIRED` to show an upgrade prompt rather than an error.
 */
export async function lpCall<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<CallResult<T>> {
  const { method = 'GET', body } = init;

  try {
    const res = await fetch(`/api/lp${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;

    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: messageFrom(payload, res.status) };
    }
    return { ok: true, status: res.status, data: payload as T, error: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: (err as Error).message };
  }
}
