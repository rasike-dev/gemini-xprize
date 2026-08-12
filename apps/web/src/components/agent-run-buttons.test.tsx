import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApproveRunButton } from './agent-run-buttons';

const run = vi.fn(async () => true);

vi.mock('@/lib/use-action', () => ({
  useAction: () => ({
    run,
    pendingKey: null,
    isPending: () => false,
    busy: false,
  }),
}));

describe('ApproveRunButton', () => {
  beforeEach(() => {
    run.mockClear();
  });

  it('approves the run through the proxy path', async () => {
    const user = userEvent.setup();
    render(<ApproveRunButton runId="run_42" />);

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(run).toHaveBeenCalledWith(
      'approve:run_42',
      '/agent-runs/run_42/approve',
      expect.objectContaining({ success: expect.stringMatching(/approved/i) }),
    );
  });
});
