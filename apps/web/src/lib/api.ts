import { API_URL, clerkEnabled, DEV_ORG_ID } from './config';

/**
 * Server-side fetch to the BizOpsMate API. Attaches a Clerk bearer token when
 * Clerk is configured, otherwise falls back to dev headers (DISABLE_AUTH=true
 * on the API). Always no-store so dashboard data is fresh.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');

  if (clerkEnabled) {
    const { auth } = await import('@clerk/nextjs/server');
    const { getToken } = await auth();
    const token = await getToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  } else {
    headers.set('x-dev-org-id', DEV_ORG_ID);
    headers.set('x-dev-role', 'OWNER');
  }

  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** Like apiFetch but returns a fallback instead of throwing (keeps pages resilient). */
export async function apiFetchSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}
