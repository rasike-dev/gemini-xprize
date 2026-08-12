import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerFormModal } from './customer-form';

const run = vi.fn(async () => true);

vi.mock('@/lib/use-action', () => ({
  useAction: () => ({
    run,
    pendingKey: null,
    isPending: () => false,
    busy: false,
  }),
}));

describe('CustomerFormModal', () => {
  beforeEach(() => {
    run.mockClear();
  });

  it('requires a phone number or email before submitting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<CustomerFormModal onClose={onClose} />);

    await user.type(document.querySelector('input[name="name"]') as HTMLInputElement, 'No Contact Co');
    await user.click(screen.getByRole('button', { name: /add customer/i }));

    expect(screen.getByText(/phone number or an email address/i)).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('submits a new customer when phone is provided', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<CustomerFormModal onClose={onClose} />);

    await user.type(document.querySelector('input[name="name"]') as HTMLInputElement, 'Kamal Silva');
    await user.type(document.querySelector('input[name="phone"]') as HTMLInputElement, '+94771234567');
    await user.click(screen.getByRole('button', { name: /add customer/i }));

    expect(run).toHaveBeenCalledWith(
      'save',
      '/customers',
      expect.objectContaining({
        method: 'POST',
        body: { name: 'Kamal Silva', phone: '+94771234567' },
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
