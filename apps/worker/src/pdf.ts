import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { Storage } from '@google-cloud/storage';
import { formatMoney } from '@ledgerpilot/shared';

interface InvoiceForPdf {
  number: string;
  currency: string;
  totalMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  dueDate: Date | null;
  customer: { name: string; email: string | null };
  lines: { description: string; quantity: number; unitPriceMinor: number; totalMinor: number }[];
}

function renderPdf(invoice: InvoiceForPdf, businessName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text(businessName, { continued: false });
    doc.moveDown(0.3).fontSize(10).fillColor('#666').text('Powered by LedgerPilot AI');
    doc.moveDown();

    doc.fillColor('#000').fontSize(16).text(`Invoice ${invoice.number}`);
    doc.fontSize(10).fillColor('#444');
    doc.text(`Bill to: ${invoice.customer.name}`);
    if (invoice.dueDate) doc.text(`Due: ${invoice.dueDate.toDateString()}`);
    doc.moveDown();

    doc.fillColor('#000').fontSize(11);
    invoice.lines.forEach((l) => {
      doc.text(
        `${l.description}  x${l.quantity}  @ ${formatMoney(l.unitPriceMinor, invoice.currency)}  =  ${formatMoney(l.totalMinor, invoice.currency)}`,
      );
    });
    doc.moveDown();
    doc.text(`Subtotal: ${formatMoney(invoice.subtotalMinor, invoice.currency)}`);
    doc.text(`Tax: ${formatMoney(invoice.taxMinor, invoice.currency)}`);
    doc.fontSize(13).text(`Total: ${formatMoney(invoice.totalMinor, invoice.currency)}`);

    doc.end();
  });
}

/**
 * Generate the invoice PDF and store it. Uploads to Cloud Storage when a bucket
 * is configured; otherwise writes to ./.data/invoices for local dev.
 */
export async function generateInvoicePdf(
  invoice: InvoiceForPdf,
  businessName: string,
): Promise<string> {
  const buffer = await renderPdf(invoice, businessName);
  const filename = `invoices/${invoice.number}.pdf`;
  const bucketName = process.env.STORAGE_BUCKET;

  if (bucketName && process.env.TASKS_DRIVER === 'cloud') {
    const storage = new Storage();
    const file = storage.bucket(bucketName).file(filename);
    await file.save(buffer, { contentType: 'application/pdf' });
    return `gs://${bucketName}/${filename}`;
  }

  const dir = path.resolve(process.cwd(), '.data', 'invoices');
  await mkdir(dir, { recursive: true });
  const localPath = path.join(dir, `${invoice.number}.pdf`);
  await writeFile(localPath, buffer);
  return `file://${localPath}`;
}
