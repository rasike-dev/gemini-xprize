import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { ToastProvider } from '@/components/toast';
import { clerkEnabled } from '@/lib/config';

export const metadata: Metadata = {
  title: {
    default: 'LedgerPilot AI — Finance & ops on autopilot',
    template: '%s',
  },
  description:
    'LedgerPilot AI turns customer messages into quotes and invoices, chases overdue payments, and shows you where your cash is going.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tree = (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );

  if (clerkEnabled) {
    const { ClerkProvider } = await import('@clerk/nextjs');
    return <ClerkProvider>{tree}</ClerkProvider>;
  }
  return tree;
}
