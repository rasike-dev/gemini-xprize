import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  LineItemsEditor,
  emptyLine,
  toLinePayload,
  type DraftLine,
} from './line-items-editor';

describe('toLinePayload', () => {
  it('converts major units to minor units and drops blank rows', () => {
    const payload = toLinePayload([
      { description: 'Flyers', quantity: '100', unitPrice: '50', taxRatePct: '18' },
      { description: '  ', quantity: '1', unitPrice: '10', taxRatePct: '0' },
      { description: 'Design', quantity: '1', unitPrice: '500', taxRatePct: '0' },
    ]);

    expect(payload).toEqual([
      { description: 'Flyers', quantity: 100, unitPriceMinor: 5000, taxRatePct: 18 },
      { description: 'Design', quantity: 1, unitPriceMinor: 50_000, taxRatePct: 0 },
    ]);
  });
});

function Harness({ initial }: { initial: DraftLine[] }) {
  const [lines, setLines] = useState(initial);
  return <LineItemsEditor lines={lines} onChange={setLines} currency="LKR" />;
}

describe('LineItemsEditor', () => {
  it('shows subtotal, tax, and total for entered lines', () => {
    render(
      <Harness
        initial={[
          { description: 'Banners', quantity: '2', unitPrice: '1000', taxRatePct: '18' },
        ]}
      />,
    );

    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('LKR 2,000.00')).toBeInTheDocument();
    expect(screen.getByText('LKR 360.00')).toBeInTheDocument();
    expect(screen.getByText('LKR 2,360.00')).toBeInTheDocument();
  });

  it('adds another editable line when requested', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[emptyLine()]} />);

    await user.click(screen.getByRole('button', { name: /add another line/i }));

    expect(screen.getAllByLabelText(/description/i)).toHaveLength(2);
  });
});
