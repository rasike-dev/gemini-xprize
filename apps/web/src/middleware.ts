import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Routes that must stay reachable without signing in: the marketing site, the
 * auth pages themselves, and the legal pages (PayHere's reviewer has to be able
 * to read our policies while logged out).
 */
const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/terms',
  '/privacy',
  '/refund-policy',
  '/sign-in',
  '/sign-up',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || (route !== '/' && pathname.startsWith(`${route}/`)),
  );
}

// When Clerk is configured, protect everything except the public routes above;
// otherwise pass through (local dev uses header-based auth against the API).
export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!clerkEnabled) return NextResponse.next();

  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');
  const isProtectedRoute = createRouteMatcher(['/app(.*)', '/onboarding(.*)']);

  return clerkMiddleware(async (auth, request) => {
    if (isPublic(new URL(request.url).pathname)) return NextResponse.next();
    if (isProtectedRoute(request)) await auth.protect();
    return NextResponse.next();
  })(req, event);
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
