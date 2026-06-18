import { NextRequest, NextResponse } from 'next/server';
import { apiUrl, buildProxyHeaders } from '../../../_proxy';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = await buildProxyHeaders();
  const upstream = await fetch(apiUrl(`/agent-runs/${id}/retry`), {
    method: 'POST',
    headers,
    cache: 'no-store',
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
