import type { Metadata } from 'next';
import { PLAN_ORDER, PLANS, TRIAL_DAYS, formatLimit } from '@ledgerpilot/shared';
import { PricingTable } from '@/components/pricing-table';

export const metadata: Metadata = {
  title: 'Pricing — BizOpsMate AI',
  description:
    'Simple LKR pricing for BizOpsMate AI. Start with a 14-day free trial, no card required. Paid locally through PayHere.',
};

const faqs = [
  {
    q: 'What counts as an AI agent action?',
    a: 'Any time an agent does work for you: reading an inquiry, drafting a quote, generating an invoice, writing a payment reminder, or producing a cash-flow summary. Your allowance resets at the start of each billing period.',
  },
  {
    q: 'Do I need a card to start?',
    a: `No. Every business starts on a ${TRIAL_DAYS}-day free trial with full access. We only ask for payment when the trial ends.`,
  },
  {
    q: 'How do I pay?',
    a: 'Through PayHere, Sri Lanka\u2019s Central Bank approved payment gateway. You can pay by Visa, Mastercard, or supported local bank and wallet methods, in rupees.',
  },
  {
    q: 'Can I change plan later?',
    a: 'Yes. Upgrade at any time and the new limits apply immediately. If you downgrade, the change takes effect at the end of your current paid period.',
  },
  {
    q: 'Does the AI message my customers without asking me?',
    a: 'Only if you switch automatic sending on, and that is available on Growth. By default every draft waits for your approval, and anything the AI is unsure about always waits regardless of your settings.',
  },
  {
    q: 'What happens if I cancel?',
    a: 'You keep access until the end of the period you have already paid for. After that the account becomes read-only so you can still export your data. We never delete your records without asking you.',
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          Pricing that fits a small business
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          One price, in rupees, paid locally. No per-invoice fees and no setup cost.
        </p>
      </div>

      <div className="mt-14">
        <PricingTable />
      </div>

      <section className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Limits at a glance
        </h2>
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Limit</th>
                {PLAN_ORDER.map((tier) => (
                  <th key={tier} className="px-5 py-3 font-medium">
                    {PLANS[tier].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="px-5 py-3 text-slate-500">Team members</td>
                {PLAN_ORDER.map((tier) => (
                  <td key={tier} className="px-5 py-3">
                    {formatLimit(PLANS[tier].maxUsers)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 text-slate-500">Customers</td>
                {PLAN_ORDER.map((tier) => (
                  <td key={tier} className="px-5 py-3">
                    {formatLimit(PLANS[tier].maxCustomers)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 text-slate-500">AI actions per month</td>
                {PLAN_ORDER.map((tier) => (
                  <td key={tier} className="px-5 py-3">
                    {formatLimit(PLANS[tier].monthlyAgentRuns)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 text-slate-500">WhatsApp follow-ups</td>
                {PLAN_ORDER.map((tier) => (
                  <td key={tier} className="px-5 py-3">
                    {PLANS[tier].features.whatsappLinks ? 'Included' : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 text-slate-500">Compliance &amp; support agents</td>
                {PLAN_ORDER.map((tier) => (
                  <td key={tier} className="px-5 py-3">
                    {PLANS[tier].features.complianceAgent ? 'Included' : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 text-slate-500">CSV &amp; PDF exports</td>
                {PLAN_ORDER.map((tier) => (
                  <td key={tier} className="px-5 py-3">
                    {PLANS[tier].features.reportExports ? 'Included' : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-5 py-3 text-slate-500">Automatic sending</td>
                {PLAN_ORDER.map((tier) => (
                  <td key={tier} className="px-5 py-3">
                    {PLANS[tier].features.autoSend ? 'Optional' : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          Questions people ask
        </h2>
        <dl className="mt-8 grid gap-6 md:grid-cols-2">
          {faqs.map((faq) => (
            <div key={faq.q} className="rounded-xl border border-slate-200 bg-white p-6">
              <dt className="font-semibold text-slate-900">{faq.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-slate-600">{faq.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
