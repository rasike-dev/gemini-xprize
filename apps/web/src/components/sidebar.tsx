import Link from 'next/link';

const nav = [
  { href: '/', label: 'Dashboard' },
  { href: '/customers', label: 'Customers' },
  { href: '/quotes', label: 'Quotes' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/agents', label: 'AI Agent Log' },
  { href: '/reports', label: 'Reports' },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 py-6">
        <div className="text-lg font-bold text-brand">LedgerPilot AI</div>
        <div className="text-xs text-slate-400">Finance & ops, on autopilot</div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400">
        Powered by Gemini on Google Cloud
      </div>
    </aside>
  );
}
