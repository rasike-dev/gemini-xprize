'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { UPGRADE_REQUIRED } from '@/lib/client';

interface ExportPayload {
  filename: string;
  mimeType: string;
  content?: string;
  base64?: string;
}

function toBlob(payload: ExportPayload): Blob {
  if (payload.base64 != null) {
    const bytes = Uint8Array.from(atob(payload.base64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: payload.mimeType });
  }
  return new Blob([payload.content ?? ''], { type: payload.mimeType });
}

function triggerDownload(payload: ExportPayload) {
  const url = URL.createObjectURL(toBlob(payload));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = payload.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportExportButtons() {
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const toast = useToast();

  async function handle(format: 'csv' | 'pdf') {
    setBusy(format);
    try {
      const res = await fetch(`/api/lp/reports/export?format=${format}`, { cache: 'no-store' });

      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { message?: string } | null;
        const message = detail?.message ?? `Export failed (${res.status})`;
        if (res.status === UPGRADE_REQUIRED) toast.upgrade(message);
        else toast.error(message);
        return;
      }

      triggerDownload((await res.json()) as ExportPayload);
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch (err) {
      toast.error((err as Error).message);
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
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {busy === 'csv' ? 'Exporting…' : 'Export CSV'}
      </button>
      <button
        type="button"
        onClick={() => void handle('pdf')}
        disabled={busy !== null}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy === 'pdf' ? 'Exporting…' : 'Export PDF'}
      </button>
    </div>
  );
}
