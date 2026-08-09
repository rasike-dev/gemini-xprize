import { NextResponse, type NextRequest } from 'next/server';
import { proxyRequest } from '../../_proxy';

/**
 * Single authenticated pass-through to the LedgerPilot API for browser-initiated
 * calls. Client components cannot mint a Clerk backend token themselves, so every
 * mutation goes through here and picks up auth server-side.
 *
 * /api/lp/quotes/123/send  ->  {API_URL}/api/quotes/123/send
 */

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * API resources the dashboard is allowed to reach through here.
 *
 * Without this the proxy would happily forward a signed-in browser session to
 * /webhooks/* or /intake, which authenticate by signature and have no business
 * being callable from a browser at all.
 */
const ALLOWED_RESOURCES = new Set([
  'agent-runs',
  'billing',
  'customers',
  'invoices',
  'quotes',
  'reminders',
  'reports',
  'tenant',
]);

async function targetPath(req: NextRequest, ctx: Ctx): Promise<string | null> {
  const { path } = await ctx.params;
  const [resource] = path;
  if (!resource || !ALLOWED_RESOURCES.has(resource)) return null;
  // Path segments arrive decoded, so a traversal attempt would show up here.
  if (path.some((segment) => segment === '..' || segment.includes('/'))) return null;

  return `/${path.join('/')}${new URL(req.url).search}`;
}

function notAllowed(): NextResponse {
  return NextResponse.json({ message: 'Unknown endpoint' }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const path = await targetPath(req, ctx);
  return path ? proxyRequest(path, 'GET') : notAllowed();
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const path = await targetPath(req, ctx);
  return path ? proxyRequest(path, 'POST', await req.text()) : notAllowed();
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const path = await targetPath(req, ctx);
  return path ? proxyRequest(path, 'PATCH', await req.text()) : notAllowed();
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const path = await targetPath(req, ctx);
  return path ? proxyRequest(path, 'DELETE') : notAllowed();
}
