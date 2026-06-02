import { NextResponse, type NextRequest } from 'next/server';

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// When Clerk is configured, enforce auth via clerkMiddleware; otherwise pass
// through (local dev uses header-based auth against the API).
export default async function middleware(req: NextRequest) {
  if (!clerkEnabled) return NextResponse.next();
  const { clerkMiddleware } = await import('@clerk/nextjs/server');
  // @ts-expect-error - clerkMiddleware returns a compatible handler
  return clerkMiddleware()(req);
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
