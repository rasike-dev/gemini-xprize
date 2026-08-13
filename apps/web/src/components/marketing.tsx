import Link from 'next/link';
import type { ReactNode } from 'react';
import { BRAND_NAME, BRAND_TAGLINE } from '@ledgerpilot/shared';
import { business } from '@/lib/business';

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex flex-col leading-tight">
          <span className="text-lg font-bold text-brand">{BRAND_NAME}</span>
          <span className="text-xs text-slate-400">{BRAND_TAGLINE}</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href="/pricing" className="hidden hover:text-slate-900 sm:block">
            Pricing
          </Link>
          <Link href="/sign-in" className="hover:text-slate-900">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-brand px-4 py-2 text-white transition hover:bg-brand-dark"
          >
            Start free trial
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-sm font-bold text-brand">{BRAND_NAME}</div>
          <p className="mt-2 text-sm text-slate-500">
            An AI finance and operations agent for small businesses in Sri Lanka.
          </p>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-900">Product</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li>
              <Link href="/pricing" className="hover:text-slate-900">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/sign-up" className="hover:text-slate-900">
                Start free trial
              </Link>
            </li>
            <li>
              <Link href="/app" className="hover:text-slate-900">
                Dashboard
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-900">Legal</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li>
              <Link href="/terms" className="hover:text-slate-900">
                Terms &amp; Conditions
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-slate-900">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/refund-policy" className="hover:text-slate-900">
                Refund Policy
              </Link>
            </li>
          </ul>
        </div>

        {/* Contact details are a hard PayHere merchant-approval requirement. */}
        <div>
          <div className="text-sm font-semibold text-slate-900">Contact</div>
          <address className="mt-3 space-y-2 text-sm not-italic text-slate-500">
            <div className="font-medium text-slate-700">{business.name}</div>
            <div className="whitespace-pre-line">{business.address}</div>
            <div>
              <a href={`tel:${business.phone}`} className="hover:text-slate-900">
                {business.phone}
              </a>
            </div>
            <div>
              <a href={`mailto:${business.email}`} className="hover:text-slate-900">
                {business.email}
              </a>
            </div>
            {business.registrationNo ? <div>Reg. No. {business.registrationNo}</div> : null}
          </address>
        </div>
      </div>

      <div className="border-t border-slate-200 px-6 py-6">
        <p className="mx-auto max-w-6xl text-xs text-slate-400">
          &copy; {new Date().getFullYear()} {business.name}. All rights reserved. Payments processed
          securely by PayHere.
        </p>
      </div>
    </footer>
  );
}

/** Shared shell for long-form legal copy. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">Last updated {updated}</p>
      <div className="mt-10 space-y-6 text-sm leading-relaxed text-slate-600 [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-slate-900">
        {children}
      </div>
    </div>
  );
}
