import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
          <Link href="/" className="flex flex-col leading-tight">
            <span className="text-lg font-bold text-brand">LedgerPilot AI</span>
            <span className="text-xs text-slate-400">Finance &amp; ops, on autopilot</span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 py-14">{children}</main>

      <footer className="border-t border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-5 text-xs text-slate-400">
          <Link href="/terms" className="hover:text-slate-600">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-slate-600">
            Privacy
          </Link>
          <Link href="/refund-policy" className="hover:text-slate-600">
            Refunds
          </Link>
        </div>
      </footer>
    </div>
  );
}
