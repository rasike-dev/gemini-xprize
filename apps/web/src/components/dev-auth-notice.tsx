import Link from 'next/link';

/**
 * Shown on auth pages when Clerk is not configured. Local development runs in
 * header-based auth mode against the API, so there is nothing to sign in to.
 */
export function DevAuthNotice() {
  return (
    <div className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6">
      <h1 className="font-semibold text-amber-900">Running without Clerk</h1>
      <p className="mt-2 text-sm leading-relaxed text-amber-800">
        <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> is not
        set, so authentication is disabled and the app talks to the API using development headers.
      </p>
      <Link
        href="/app"
        className="mt-5 inline-block rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
      >
        Open the dashboard
      </Link>
    </div>
  );
}
