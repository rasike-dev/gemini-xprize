'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/app', label: 'Dashboard' },
  { href: '/app/customers', label: 'Customers' },
  { href: '/app/quotes', label: 'Quotes' },
  { href: '/app/invoices', label: 'Invoices' },
  { href: '/app/reminders', label: 'Reminders' },
  { href: '/app/agents', label: 'AI Agent Log' },
  { href: '/app/reports', label: 'Reports' },
];

const secondaryNav = [
  { href: '/app/billing', label: 'Billing & plan' },
  { href: '/app/settings', label: 'Settings' },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-brand/10 text-brand'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  // Exact match for /app so the dashboard link is not active on every child page.
  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);

  return (
    <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-6">
        <Link href="/app" className="block">
          <div className="text-lg font-bold text-brand">LedgerPilot AI</div>
          <div className="text-xs text-slate-400">Finance &amp; ops, on autopilot</div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <div className="my-4 border-t border-slate-100" />

        {secondaryNav.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400">
        Powered by Gemini on Google Cloud
      </div>
    </aside>
  );
}
