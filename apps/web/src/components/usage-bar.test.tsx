import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageBar } from './usage-bar';

describe('UsageBar', () => {
  it('shows amber warning when usage is above 80%', () => {
    render(<UsageBar label="Customers" used={42} limit={50} />);

    expect(screen.getByText(/allowance left/i)).toHaveClass('text-amber-600');
  });

  it('shows rose message when the limit is reached', () => {
    render(<UsageBar label="AI actions" used={30} limit={30} />);

    expect(screen.getByText(/limit reached/i)).toHaveClass('text-rose-600');
  });

  it('omits the cap for unlimited plans', () => {
    render(<UsageBar label="Customers" used={500} limit={-1} />);

    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.queryByText('500 /')).toBeNull();
  });
});
