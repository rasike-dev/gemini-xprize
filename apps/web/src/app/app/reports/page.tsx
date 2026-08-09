import { formatMoney } from '@ledgerpilot/shared';
import { apiFetchSafe } from '@/lib/api';
import { Card, PageHeader, StatCard } from '@/components/ui';
import { ReportExportButtons } from '@/components/report-export-buttons';

interface Summary {
  revenueThisMonthMinor: number;
  overdueMinor: number;
  pendingInvoices: number;
  customerCount: number;
}

export default async function ReportsPage() {
  const summary = await apiFetchSafe<Summary>('/dashboard/summary', {
    revenueThisMonthMinor: 0,
    overdueMinor: 0,
    pendingInvoices: 0,
    customerCount: 0,
  });

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Monthly sales, collections, and overdue - export-ready for your accountant."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue this month" value={formatMoney(summary.revenueThisMonthMinor)} />
        <StatCard label="Overdue" value={formatMoney(summary.overdueMinor)} />
        <StatCard label="Pending invoices" value={String(summary.pendingInvoices)} />
        <StatCard label="Customers" value={String(summary.customerCount)} />
      </div>

      <Card className="mt-6 p-5">
        <p className="text-sm text-slate-500">
          Export to CSV/PDF for your accountant is available via the API
          (<code className="rounded bg-slate-100 px-1">GET /api/reports/export</code>) and wired
          into the monthly Cash-flow agent summary.
        </p>
        <ReportExportButtons />
      </Card>
    </div>
  );
}
