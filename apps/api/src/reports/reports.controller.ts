import { Controller, Get, Header, Query } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { TenantId } from '../auth/decorators.js';
import { RequiresFeature } from '../billing/entitlements.decorators.js';
import { ReportsService } from './reports.service.js';

const exportQuerySchema = z.object({
  format: z.enum(['csv', 'pdf']).default('csv'),
});

function formatMoney(minor: number): string {
  return (minor / 100).toFixed(2);
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@TenantId() tenantId: string) {
    return this.reports.monthlySummary(tenantId);
  }

  // A read, but a paid one: gate on the feature rather than the HTTP method.
  @RequiresFeature('reportExports')
  @Get('export')
  @Header('Cache-Control', 'no-store')
  async export(
    @TenantId() tenantId: string,
    @Query() queryRaw: Record<string, string | undefined>,
  ) {
    const query = exportQuerySchema.parse(queryRaw);
    const report = await this.reports.monthlySummary(tenantId);

    if (query.format === 'pdf') {
      const pdf = await this.buildPdf(report);
      return {
        filename: `ledgerpilot-report-${report.monthLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`,
        mimeType: 'application/pdf',
        base64: pdf.toString('base64'),
      };
    }

    const csvLines = [
      'metric,value',
      `month,${report.monthLabel}`,
      `sales_minor,${report.salesMinor}`,
      `collections_minor,${report.collectedMinor}`,
      `overdue_minor,${report.overdueMinor}`,
      `invoice_count,${report.invoiceCount}`,
      `pending_invoice_count,${report.pendingInvoiceCount}`,
      '',
      'best_customers,total_minor',
      ...report.bestCustomers.map((c) => `"${c.name.replaceAll('"', '""')}",${c.totalMinor}`),
    ];

    return {
      filename: `ledgerpilot-report-${report.monthLabel.replace(/\s+/g, '-').toLowerCase()}.csv`,
      mimeType: 'text/csv',
      content: csvLines.join('\n'),
    };
  }

  private buildPdf(report: {
    monthLabel: string;
    salesMinor: number;
    collectedMinor: number;
    overdueMinor: number;
    invoiceCount: number;
    pendingInvoiceCount: number;
    bestCustomers: Array<{ name: string; totalMinor: number }>;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('LedgerPilot Monthly Report');
      doc.moveDown(0.2).fontSize(11).fillColor('#555').text(report.monthLabel);
      doc.moveDown();

      doc.fillColor('#000').fontSize(12);
      doc.text(`Sales: ${formatMoney(report.salesMinor)}`);
      doc.text(`Collections: ${formatMoney(report.collectedMinor)}`);
      doc.text(`Overdue: ${formatMoney(report.overdueMinor)}`);
      doc.text(`Invoices: ${report.invoiceCount}`);
      doc.text(`Pending invoices: ${report.pendingInvoiceCount}`);
      doc.moveDown();

      doc.fontSize(13).text('Best customers');
      if (report.bestCustomers.length === 0) {
        doc.fontSize(11).text('No customer activity this month.');
      } else {
        report.bestCustomers.forEach((c, idx) => {
          doc.fontSize(11).text(`${idx + 1}. ${c.name} - ${formatMoney(c.totalMinor)}`);
        });
      }

      doc.end();
    });
  }
}
