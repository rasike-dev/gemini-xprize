'use client';

import { useMemo } from 'react';
import { formatMoney, lineTotalMinor, sumMinor } from '@ledgerpilot/shared';
import { Input } from '@/components/form';

export interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRatePct: string;
}

export interface LineItemPayload {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRatePct: number;
}

export function emptyLine(): DraftLine {
  return { description: '', quantity: '1', unitPrice: '', taxRatePct: '18' };
}

/** Converts the draft rows into the minor-unit payload the API expects. */
export function toLinePayload(lines: DraftLine[]): LineItemPayload[] {
  return lines
    .filter((line) => line.description.trim() && Number(line.unitPrice) > 0)
    .map((line) => ({
      description: line.description.trim(),
      quantity: Number(line.quantity) || 1,
      // Entered in major units; stored in minor units to avoid float drift.
      unitPriceMinor: Math.round(Number(line.unitPrice) * 100),
      taxRatePct: Number(line.taxRatePct) || 0,
    }));
}

export function LineItemsEditor({
  lines,
  onChange,
  currency,
}: {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  currency: string;
}) {
  const totals = useMemo(() => {
    const payload = toLinePayload(lines);
    const subtotal = sumMinor(payload.map((l) => l.quantity * l.unitPriceMinor));
    const total = sumMinor(
      payload.map((l) => lineTotalMinor(l.quantity, l.unitPriceMinor, l.taxRatePct)),
    );
    return { subtotal, tax: total - subtotal, total };
  }, [lines]);

  function update(index: number, patch: Partial<DraftLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <div>
      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={index} className="rounded-lg border border-slate-200 p-3">
            <Input
              value={line.description}
              onChange={(e) => update(index, { description: e.target.value })}
              placeholder="What are you supplying?"
              maxLength={500}
              aria-label={`Line ${index + 1} description`}
            />

            <div className="mt-3 grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-slate-500">Quantity</span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={line.quantity}
                  onChange={(e) => update(index, { quantity: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Unit price ({currency})</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitPrice}
                  onChange={(e) => update(index, { unitPrice: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Tax %</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={line.taxRatePct}
                  onChange={(e) => update(index, { taxRatePct: e.target.value })}
                />
              </label>
            </div>

            {lines.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
                className="mt-3 text-xs text-rose-600 underline hover:text-rose-700"
              >
                Remove this line
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...lines, emptyLine()])}
        className="mt-3 text-sm font-medium text-brand underline hover:text-brand-dark"
      >
        Add another line
      </button>

      <dl className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between text-slate-500">
          <dt>Subtotal</dt>
          <dd>{formatMoney(totals.subtotal, currency)}</dd>
        </div>
        <div className="flex justify-between text-slate-500">
          <dt>Tax</dt>
          <dd>{formatMoney(totals.tax, currency)}</dd>
        </div>
        <div className="flex justify-between font-semibold text-slate-900">
          <dt>Total</dt>
          <dd>{formatMoney(totals.total, currency)}</dd>
        </div>
      </dl>
    </div>
  );
}
