import type { Metadata } from 'next';
import { TRIAL_DAYS } from '@ledgerpilot/shared';
import { BusinessProfileForm } from '@/components/business-profile-form';
import { clerkEnabled } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Set up your business — BizOpsMate AI',
};

function Steps({ current }: { current: 1 | 2 }) {
  const labels = ['Create your workspace', 'Business details'];
  return (
    <ol className="mb-8 flex items-center gap-3 text-sm">
      {labels.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                active
                  ? 'bg-brand text-white'
                  : done
                    ? 'bg-brand/15 text-brand'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? '\u2713' : step}
            </span>
            <span className={active ? 'font-medium text-slate-900' : 'text-slate-500'}>{label}</span>
            {step < labels.length ? <span className="h-px w-8 bg-slate-200" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export default async function OnboardingPage() {
  // Without Clerk there is no organization to create; go straight to the profile
  // step against the demo tenant.
  if (!clerkEnabled) {
    return (
      <div className="w-full max-w-lg">
        <Steps current={2} />
        <BusinessProfileForm />
      </div>
    );
  }

  const { auth } = await import('@clerk/nextjs/server');
  const { orgId } = await auth();

  if (!orgId) {
    const { CreateOrganization } = await import('@clerk/nextjs');
    return (
      <div className="w-full max-w-lg">
        <Steps current={1} />
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Create your workspace</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Name it after your business. This keeps your records separate from every other business
            on BizOpsMate, and you can invite your team into it later.
          </p>
        </div>
        <CreateOrganization
          afterCreateOrganizationUrl="/onboarding"
          skipInvitationScreen
          hideSlug
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg">
      <Steps current={2} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Tell us about your business</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          This appears on the quotes and invoices you send. Your {TRIAL_DAYS}-day free trial has
          already started.
        </p>
      </div>
      <BusinessProfileForm />
    </div>
  );
}
