import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing';
import { LEGAL_LAST_UPDATED, business } from '@/lib/business';

// NOTE FOR THE OPERATOR: drafted to match what the system actually stores and
// which sub-processors it actually uses. Have a lawyer review before launch, and
// keep the sub-processor list in step with reality.

export const metadata: Metadata = {
  title: 'Privacy Policy — LedgerPilot AI',
  description: 'How LedgerPilot AI collects, uses, and protects personal data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL_LAST_UPDATED}>
      <p>
        This policy explains how <strong>{business.name}</strong> collects, uses, and protects
        personal data when you use LedgerPilot AI. We are the data controller for your account
        information, and we act as a data processor for the customer records you put into the
        Service.
      </p>

      <h2>1. What we collect</h2>
      <p>
        <strong>Account data.</strong> Your name, email address, business name, business
        registration or VAT number, country, and currency.
      </p>
      <p>
        <strong>Business records you enter.</strong> Your customers&rsquo; names and contact details,
        inquiries, quotes, invoices, payments, and reminders. This may include personal data about
        your customers, for which you are the controller.
      </p>
      <p>
        <strong>Payment data.</strong> Your subscription plan and status, and a payment reference
        from PayHere. <strong>We never receive or store your full card number.</strong>
      </p>
      <p>
        <strong>AI processing records.</strong> For each AI action we store the input, the output,
        the model used, a confidence score, tokens consumed, and who approved it. This is what makes
        the audit log possible.
      </p>
      <p>
        <strong>Technical data.</strong> Server logs containing IP address, request path, timestamp,
        and response status, plus error diagnostics.
      </p>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To provide the Service and generate the drafts and summaries you ask for.</li>
        <li>To authenticate you and keep your account secure.</li>
        <li>To take payment and manage your subscription.</li>
        <li>To send service messages about your account, billing, and security.</li>
        <li>To diagnose faults, prevent abuse, and improve reliability.</li>
        <li>To meet our legal and tax obligations.</li>
      </ul>

      <h2>3. Legal basis</h2>
      <p>
        We process account and business data to perform our contract with you; technical and security
        data under our legitimate interest in operating a safe and reliable service; and financial
        records to comply with legal obligations. Where we rely on consent, such as for marketing
        email, you can withdraw it at any time.
      </p>

      <h2>4. How AI processing works</h2>
      <p>
        When an agent runs, the relevant text — for example a customer inquiry or invoice details — is
        sent to Google&rsquo;s Gemini API to generate a draft. Two points worth being explicit about:
      </p>
      <ul>
        <li>
          <strong>Your data is not used to train Google&rsquo;s models</strong> under the paid API
          terms we operate on.
        </li>
        <li>
          We validate every AI response against a strict schema before it is written to your account,
          and low-confidence output is held for your approval instead of being acted on.
        </li>
      </ul>

      <h2>5. Who we share it with</h2>
      <p>We use these sub-processors, and only for the purposes shown:</p>
      <ul>
        <li>
          <strong>Google Cloud Platform</strong> — hosting, database, and file storage.
        </li>
        <li>
          <strong>Google Gemini API</strong> — generating AI drafts and summaries.
        </li>
        <li>
          <strong>Clerk</strong> — user authentication and team management.
        </li>
        <li>
          <strong>PayHere</strong> — subscription payment processing.
        </li>
        <li>
          <strong>Resend</strong> — sending transactional and reminder email.
        </li>
        <li>
          <strong>Sentry</strong> — error monitoring and diagnostics.
        </li>
      </ul>
      <p>
        We do not sell personal data. We may disclose data where the law requires it, or to protect
        our rights and the safety of our users.
      </p>

      <h2>6. International transfers</h2>
      <p>
        Our infrastructure is hosted in the Asia South (Mumbai) region, and some sub-processors
        operate elsewhere, including in the United States and Europe. Where data leaves Sri Lanka we
        rely on the transfer safeguards offered by those providers, such as standard contractual
        clauses.
      </p>

      <h2>7. How we protect it</h2>
      <ul>
        <li>Data is encrypted in transit (TLS) and at rest.</li>
        <li>
          Each business&rsquo;s records are isolated by Postgres row-level security, enforced by the
          database rather than only by application code.
        </li>
        <li>Secrets are held in Google Secret Manager, not in code or configuration files.</li>
        <li>Access to production is restricted and audited.</li>
        <li>Sensitive actions are recorded in an audit trail.</li>
      </ul>

      <h2>8. How long we keep it</h2>
      <ul>
        <li>Account and business records: while your account is active.</li>
        <li>
          After cancellation: 90 days, so you can export or reactivate, then deletion on request.
        </li>
        <li>Financial records: as long as Sri Lankan tax law requires.</li>
        <li>Server logs: 30 days.</li>
        <li>Generated invoice PDFs: up to 24 months.</li>
      </ul>

      <h2>9. Your rights</h2>
      <p>You may ask us to:</p>
      <ul>
        <li>Give you a copy of the personal data we hold about you.</li>
        <li>Correct data that is inaccurate.</li>
        <li>Delete your data, where we are not required to keep it.</li>
        <li>Export your data in a portable format.</li>
        <li>Stop sending you marketing email.</li>
      </ul>
      <p>
        Write to <a href={`mailto:${business.email}`}>{business.email}</a> and we will respond within
        30 days.
      </p>

      <h2>10. Your responsibilities as a controller</h2>
      <p>
        When you upload your customers&rsquo; details, you are their data controller. You are
        responsible for having a lawful basis to hold their information and to contact them, and for
        honouring their requests. We will assist you where we reasonably can.
      </p>

      <h2>11. Cookies</h2>
      <p>
        We use only the cookies needed to keep you signed in and to keep sessions secure. We do not
        use advertising or cross-site tracking cookies.
      </p>

      <h2>12. Children</h2>
      <p>
        The Service is for businesses and is not directed at anyone under 18. We do not knowingly
        collect data from children.
      </p>

      <h2>13. Changes</h2>
      <p>
        We will post any update here and change the date above. For material changes we will notify
        you by email or in the application.
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
