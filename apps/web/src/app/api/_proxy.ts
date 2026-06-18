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
