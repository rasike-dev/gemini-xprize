import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPGRADE_REQUIRED, lpCall } from './client';

describe('lpCall', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed data on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'cust_1' }), { status: 200 })),
    );

    const result = await lpCall<{ id: string }>('/customers');

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { id: 'cust_1' },
      error: null,
    });
  });

  it('surfaces API message on 402 without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'WhatsApp follow-ups is not part of the Starter plan.' }), {
          status: UPGRADE_REQUIRED,
        }),
      ),
    );

    const result = await lpCall('/quotes/q1/send', { method: 'POST' });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(402);
    expect(result.error).toMatch(/WhatsApp follow-ups/);
  });

  it('returns a generic message for other HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Customer not found' }), { status: 404 })),
    );

    const result = await lpCall('/customers/missing');

    expect(result).toMatchObject({ ok: false, status: 404, error: 'Customer not found' });
  });

  it('never throws when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('Network down'))));

    const result = await lpCall('/customers');

    expect(result).toMatchObject({ ok: false, status: 0, error: 'Network down' });
  });
});
