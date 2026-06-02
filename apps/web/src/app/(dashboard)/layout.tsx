import { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { clerkEnabled } from '@/lib/config';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let userButton: ReactNode = (
    <span className="text-xs text-slate-400">dev mode (no Clerk)</span>
  );
  if (clerkEnabled) {
    const { UserButton } = await import('@clerk/nextjs');
    userButton = <UserButton afterSignOutUrl="/" />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-slate-200 bg-white px-8 py-3">
          {userButton}
        </header>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
