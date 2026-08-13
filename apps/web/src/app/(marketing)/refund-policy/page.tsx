import type { Metadata } from 'next';
import { PLAN_CURRENCY, TRIAL_DAYS } from '@ledgerpilot/shared';
import { LegalPage } from '@/components/marketing';
import { LEGAL_LAST_UPDATED, business } from '@/lib/business';

// NOTE FOR THE OPERATOR: PayHere requires a published refund policy before they
// will approve a merchant account. The 7-day goodwill window below is a
// deliberate choice, not a legal requirement -- change it if you prefer, but keep
// this page honest about what you will actually do.

export const metadata: Metadata = {
  title: 'Refund Policy — BizOpsMate AI',
  description: 'When BizOpsMate AI issues refunds, and how to request one.',
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy" updated={LEGAL_LAST_UPDATED}>
      <p>
        BizOpsMate AI is a subscription software service supplied by{' '}
        <strong>{business.name}</strong>. This page explains exactly when we refund a payment. We
        have tried to write it plainly rather than defensively.
      </p>

      <h2>1. Try before you pay</h2>
      <p>
        Every account starts with a {TRIAL_DAYS}-day free trial with full access and no card
        required. We would much rather you found out during the trial that the Service is not right
        for you than pay for something you do not want.
      </p>

      <h2>2. Cancelling</h2>
      <ul>
        <li>You can cancel at any time from Billing &amp; plan inside the application.</li>
        <li>
          Cancelling stops future charges. You keep full access until the end of the period you have
          already paid for.
        </li>
        <li>
          After that the account becomes read-only so you can still export your records. We do not
          delete your data without telling you first.
        </li>
      </ul>

      <h2>3. When we refund</h2>
      <p>
        <strong>Within 7 days of your first payment.</strong> If you subscribe and decide within 7
        days that the Service is not for you, tell us and we will refund that payment in full. No
        explanation required.
      </p>
      <p>
        <strong>Service failure.</strong> If a fault on our side prevented you from using the Service
        for a sustained period, we will refund a fair proportion of the affected period, or extend
        your subscription by the same amount, whichever you prefer.
      </p>
      <p>
        <strong>Duplicate or incorrect charges.</strong> Refunded in full as soon as we confirm them.
        If you spot one, please tell us — we would rather hear it from you than find it later.
      </p>
      <p>
        <strong>Unauthorised payment.</strong> If a payment was made from your account without
        authorisation, contact us immediately and we will investigate and refund where confirmed.
      </p>

      <h2>4. When we do not refund</h2>
      <p>To be straightforward about the limits:</p>
      <ul>
        <li>
          Part-used periods after the first 7 days. If you cancel mid-period, you keep access to the
          end of it rather than receiving money back.
        </li>
        <li>
          Renewal payments after the first period, unless one of the situations in section 3 applies.
        </li>
        <li>
          Dissatisfaction with the quality of AI-generated drafts. AI output is a draft for you to
          review, as set out in our <a href="/terms">Terms &amp; Conditions</a>, and the free trial
          exists so you can judge this before paying.
        </li>
        <li>Accounts terminated for breaching our Terms &amp; Conditions.</li>
        <li>
          Outages caused by third parties outside our control, such as your internet connection or a
          payment provider.
        </li>
      </ul>

      <h2>5. How to request a refund</h2>
      <p>
        Email <a href={`mailto:${business.email}`}>{business.email}</a> with:
      </p>
      <ul>
        <li>The business name on the account</li>
        <li>The email address you signed up with</li>
        <li>The payment date and amount</li>
        <li>The reason for the request</li>
      </ul>
      <p>
        We aim to acknowledge within 2 business days and to decide within 7 business days. If you
        prefer, call us on <a href={`tel:${business.phone}`}>{business.phone}</a>.
      </p>

      <h2>6. How refunds are paid</h2>
      <ul>
        <li>
          Refunds are made in {PLAN_CURRENCY} to the original payment method through PayHere. We
          cannot redirect a refund to a different card or account.
        </li>
        <li>
          Once we approve a refund, PayHere and your bank typically take 5 to 14 business days to
          post it. That part is outside our control.
        </li>
        <li>We do not deduct a processing fee from refunds.</li>
      </ul>

      <h2>7. Price changes</h2>
      <p>
        If we increase the price of your plan, we will give you at least 30 days&rsquo; notice before
        it applies. If you do not want to continue at the new price, cancel before it takes effect and
        you will not be charged.
      </p>

      <h2>8. Contact</h2>
      <p>
        {business.name}
        <br />
        {business.address}
        <br />
        Email: <a href={`mailto:${business.email}`}>{business.email}</a>
        <br />
        Phone: <a href={`tel:${business.phone}`}>{business.phone}</a>
      </p>
    </LegalPage>
  );
}
