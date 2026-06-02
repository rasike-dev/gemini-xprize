import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { clerkEnabled } from '@/lib/config';

export const metadata: Metadata = {
  title: 'LedgerPilot AI',
  description: 'AI finance & operations agent for small businesses',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  if (clerkEnabled) {
    const { ClerkProvider } = await import('@clerk/nextjs');
    return (
      <ClerkProvider>
        <html lang="en">
          <body>{children}</body>
        </html>
      </ClerkProvider>
    );
  }
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
