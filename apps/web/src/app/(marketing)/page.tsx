import Link from 'next/link';
import type { Metadata } from 'next';
import { TRIAL_DAYS } from '@ledgerpilot/shared';
import { PricingTable } from '@/components/pricing-table';

export const metadata: Metadata = {
  title: 'BizOpsMate AI — Quotes, invoices and payment follow-ups on autopilot',
  description:
    'BizOpsMate AI turns customer messages into quotes and invoices, chases overdue payments, and shows you where your cash is going. Built for small businesses in Sri Lanka.',
};

const steps = [
  {
    label: 'A customer messages you',
    body: 'A WhatsApp message or email arrives: "Can you quote 20 printed T-shirts?" BizOpsMate reads it and works out what they actually want.',
  },
  {
    label: 'A quote is drafted',
    body: 'Line items, quantities, and VAT are worked out for you in LKR. You review it, adjust anything, and send.',
  },
  {
    label: 'The invoice writes itself',
    body: 'When the quote is accepted, the invoice is created and a PDF is generated, with its own shareable payment link.',
  },
  {
    label: 'Overdue payments get chased',
    body: 'Every morning BizOpsMate finds what is overdue and drafts a polite, correctly-worded reminder. One tap sends it on WhatsApp or email.',
  },
  {
    label: 'You see your cash position',
    body: 'A plain-English weekly summary: what you sold, what you collected, what is still owed, and what needs attention.',
  },
];

const trustPoints = [
  {
    title: 'Every AI decision is logged',
    body: 'Each action is recorded as an auditable run with the model used, its confidence, the tokens spent, and who approved it. Nothing happens in a black box.',
  },
  {
    title: 'You approve before anything sends',
    body: 'Low-confidence drafts wait for you. Automatic sending is opt-in, per business, and you can switch it off at any time.',
  },
  {
    title: 'Your data is isolated at the database',
    body: 'Every business is separated by Postgres row-level security, not just by application code. One business can never read another one, even if our code has a bug.',
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="border-b border-slate-100 bg-gradient-to-b from-brand/5 to-white">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              Powered by Gemini on Google Cloud
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Your quotes, invoices and payment chasing,
              <span className="text-brand"> handled overnight.</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-600">
              BizOpsMate AI reads the messages your customers send you, drafts the quote, raises
              the invoice, and follows up on what they owe you. You stay in control and approve
              anything before it goes out.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/sign-up"
                className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
              >
                Start your {TRIAL_DAYS}-day free trial
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              No card required to start. Prices in LKR, paid locally through PayHere.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
          From &ldquo;can you quote this?&rdquo; to money in the bank
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          Five steps that normally cost you an evening of admin each week. BizOpsMate runs them for
          you and shows its work.
        </p>

        <ol className="mt-12 space-y-5">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className="flex gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{step.label}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            AI you can actually audit
          </h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            You are letting software talk to your customers about money. That only works if you can
            see exactly what it did and why.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {trustPoints.map((point) => (
              <div key={point.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold text-slate-900">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            Simple pricing in rupees
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Start with a {TRIAL_DAYS}-day free trial. No card needed until you decide it is worth
            paying for.
          </p>
        </div>
        <div className="mt-12">
          <PricingTable />
        </div>
      </section>

      <section className="border-t border-slate-100 bg-brand">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            Get your evenings back
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-brand-light">
            Set up your business in a couple of minutes and let BizOpsMate handle the next inquiry
            that lands.
          </p>
          <Link
            href="/sign-up"
            className="mt-8 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-dark shadow-sm transition hover:bg-slate-100"
          >
            Start your free trial
          </Link>
        </div>
      </section>
    </>
  );
}
