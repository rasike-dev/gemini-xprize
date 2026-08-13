import type { Metadata } from 'next';
import { TRIAL_DAYS } from '@ledgerpilot/shared';
import { DevAuthNotice } from '@/components/dev-auth-notice';
import { clerkEnabled } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Start your free trial — BizOpsMate AI',
};

export default async function SignUpPage() {
  if (!clerkEnabled) return <DevAuthNotice />;

  const { SignUp } = await import('@clerk/nextjs');
  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          Start your {TRIAL_DAYS}-day free trial
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          No card required. You will set up your business in the next step.
        </p>
      </div>
      <SignUp signInUrl="/sign-in" forceRedirectUrl="/onboarding" />
    </div>
  );
}
