import { NextRequest, NextResponse } from 'next/server';
import { apiUrl, buildProxyHeaders } from '../../_proxy';

export async function POST(req: NextRequest) {
  const headers = await buildProxyHeaders();
  const payload = await req.text();
  const upstream = await fetch(apiUrl('/agent-runs'), {
    method: 'POST',
    headers,
    body: payload,
    cache: 'no-store',
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
