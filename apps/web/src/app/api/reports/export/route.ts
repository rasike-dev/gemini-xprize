import { NextRequest, NextResponse } from 'next/server';
import { apiUrl, buildProxyHeaders } from '../../_proxy';

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format') ?? 'csv';
  const headers = await buildProxyHeaders();

  const upstream = await fetch(`${apiUrl('/reports/export')}?format=${format}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
