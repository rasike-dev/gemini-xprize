'use client';

import { useState } from 'react';

async function download(format: 'csv' | 'pdf') {
  const res = await fetch(`/api/reports/export?format=${format}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const payload = (await res.json()) as {
    filename: string;
    mimeType: string;
    content?: string;
    base64?: string;
  };

  const blob =
    payload.base64 != null
      ? new Blob([Uint8Array.from(atob(payload.base64), (c) => c.charCodeAt(0))], {
          type: payload.mimeType,
        })
      : new Blob([payload.content ?? ''], { type: payload.mimeType });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = payload.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportExportButtons() {
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(format: 'csv' | 'pdf') {
    setBusy(format);
    setError(null);
    try {
      await download(format);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void handle('csv')}
        disabled={busy !== null}
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
      </button>
      <button
        type="button"
        onClick={() => void handle('pdf')}
        disabled={busy !== null}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
      >
        {busy === 'pdf' ? 'Exporting PDF...' : 'Export PDF'}
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
