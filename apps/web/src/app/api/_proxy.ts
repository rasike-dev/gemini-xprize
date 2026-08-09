import { NextResponse } from 'next/server';
import { API_URL, DEV_ORG_ID, clerkEnabled } from '@/lib/config';

export async function buildProxyHeaders(): Promise<Headers> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (clerkEnabled) {
    const { auth } = await import('@clerk/nextjs/server');
    const { getToken } = await auth();
    const token = await getToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  } else {
    headers.set('x-dev-org-id', DEV_ORG_ID);
    headers.set('x-dev-role', 'OWNER');
  }
  return headers;
}

export function apiUrl(path: string): string {
  return `${API_URL}/api${path}`;
}

/**
 * Forwards a browser request to the API with server-side auth attached, and
 * relays the response verbatim. Status codes matter here: the entitlement guard
 * answers 402 to signal "upgrade required", and the client renders that.
 */
export async function proxyRequest(
  path: string,
  method: string,
  body?: BodyInit | null,
): Promise<NextResponse> {
  const headers = await buildProxyHeaders();
  const upstream = await fetch(apiUrl(path), {
    method,
    headers,
    body: body ?? undefined,
    cache: 'no-store',
  });

  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const responseHeaders = new Headers({ 'content-type': contentType });

  // Preserve attachment filenames for CSV/PDF exports.
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) responseHeaders.set('content-disposition', disposition);

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}
