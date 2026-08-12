import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/customers',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('Sidebar', () => {
  it('highlights the current section without marking dashboard active on child routes', () => {
    render(<Sidebar />);

    const customers = screen.getByRole('link', { name: 'Customers' });
    const dashboard = screen.getByRole('link', { name: 'Dashboard' });

    expect(customers.className).toMatch(/bg-brand/);
    expect(dashboard.className).not.toMatch(/bg-brand/);
  });
});
