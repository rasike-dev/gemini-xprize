import type { Metadata } from 'next';
import { PLAN_CURRENCY, TRIAL_DAYS } from '@ledgerpilot/shared';
import { LegalPage } from '@/components/marketing';
import { LEGAL_LAST_UPDATED, business } from '@/lib/business';

// NOTE FOR THE OPERATOR: this is a solid starting point drafted around how the
// product actually behaves, but have a Sri Lankan lawyer review it before you
// take real money. See docs/LAUNCH-CHECKLIST.md.

export const metadata: Metadata = {
  title: 'Terms & Conditions — BizOpsMate AI',
  description: 'The terms governing your use of the BizOpsMate AI service.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" updated={LEGAL_LAST_UPDATED}>
      <p>
        These terms govern your use of BizOpsMate AI (the &ldquo;Service&rdquo;), operated by{' '}
        <strong>{business.name}</strong>
        {business.registrationNo ? ` (Reg. No. ${business.registrationNo})` : ''}, {business.address}
        . By creating an account you agree to them. If you do not agree, please do not use the
        Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        BizOpsMate AI helps small businesses turn customer inquiries into quotes and invoices,
        draft payment reminders, and review their cash position. It uses artificial intelligence,
        including Google Gemini models, to generate drafts and summaries.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must provide accurate registration details and keep them current.</li>
        <li>
          You are responsible for activity under your account, including actions taken by team
          members you invite.
        </li>
        <li>You must keep your login credentials confidential.</li>
        <li>
          You must be at least 18 years old and authorised to act for the business you register.
        </li>
      </ul>

      <h2>3. Free trial</h2>
      <p>
        New accounts receive a {TRIAL_DAYS}-day free trial with full access. No payment details are
        required to begin. When the trial ends, access to paid features stops until you subscribe.
        We do not charge you automatically at the end of a trial.
      </p>

      <h2>4. Fees and payment</h2>
      <ul>
        <li>
          Subscription fees are stated on our pricing page in {PLAN_CURRENCY} and are payable in
          advance for the period you select.
        </li>
        <li>
          Payments are processed by PayHere. We do not receive or store your full card details.
        </li>
        <li>
          Your access continues to the end of each period you have paid for. We will tell you before
          a period ends so you can renew.
        </li>
        <li>
          We may change our prices. Any change applies from your next billing period, and we will
          give you at least 30 days&rsquo; notice.
        </li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service to send unsolicited bulk messages or spam.</li>
        <li>Upload unlawful, misleading, or infringing content.</li>
        <li>
          Attempt to access another customer&rsquo;s data, or probe, scan, or test our
          infrastructure without written permission.
        </li>
        <li>Resell or white-label the Service without our written agreement.</li>
        <li>Use the Service to breach any applicable law, including data protection and tax law.</li>
      </ul>

      <h2>6. Artificial intelligence: important limitations</h2>
      <p>
        <strong>
          AI-generated output is a draft, not professional advice, and you are responsible for
          reviewing it before it is sent or relied upon.
        </strong>{' '}
        This matters, so please read it carefully:
      </p>
      <ul>
        <li>
          Quotes, invoices, reminders, summaries, and compliance checks produced by the Service may
          contain errors, including errors in amounts, tax treatment, and customer details.
        </li>
        <li>
          Nothing the Service produces is accounting, tax, or legal advice. Consult a qualified
          professional for those matters.
        </li>
        <li>
          If you enable automatic sending, you are authorising the Service to send messages to your
          customers without individual review, and you accept responsibility for those messages.
        </li>
        <li>
          You remain solely responsible for the accuracy of your statutory records and filings.
        </li>
      </ul>

      <h2>7. Your data</h2>
      <p>
        You own the data you put into the Service. You grant us the licence needed to host, process,
        and transmit it in order to operate the Service for you. Our handling of personal data is
        described in our <a href="/privacy">Privacy Policy</a>.
      </p>
      <p>
        Each business&rsquo;s data is isolated at the database level using Postgres row-level
        security. You can export your data at any time while your account is active.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        The Service depends on third parties including Google Cloud and Google Gemini (hosting and
        AI), Clerk (authentication), PayHere (payments), and Resend (email delivery). Their
        availability is outside our control, and their own terms apply to their portion of the
        service.
      </p>

      <h2>9. Availability</h2>
      <p>
        We work to keep the Service available and reliable, but we do not guarantee uninterrupted
        access. We may suspend access temporarily for maintenance, and we will try to give notice
        where practical.
      </p>

      <h2>10. Suspension and termination</h2>
      <ul>
        <li>You may cancel at any time from your billing settings.</li>
        <li>
          On cancellation you keep access until the end of the period you have paid for, after which
          the account becomes read-only so you can export your records.
        </li>
        <li>
          We may suspend or terminate an account that breaches these terms, does not pay, or puts
          the Service or other customers at risk. Where the breach is not serious we will give you
          notice and a chance to fix it.
        </li>
        <li>We will not delete your data without giving you notice and an opportunity to export.</li>
      </ul>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our total liability arising out of or relating to the
        Service is limited to the fees you paid us in the twelve months before the claim arose. We
        are not liable for indirect or consequential loss, or for lost profits, revenue, goodwill, or
        data.
      </p>
      <p>
        Nothing in these terms excludes liability that cannot lawfully be excluded, including
        liability for fraud.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We may update these terms. For material changes we will notify you by email or in the
        application at least 30 days before they take effect. Continuing to use the Service after
        that date means you accept the updated terms.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the laws of Sri Lanka, and the courts of Sri Lanka have
        exclusive jurisdiction over any dispute.
      </p>

      <h2>14. Contact</h2>
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
