import type { Metadata } from 'next';
import { DevAuthNotice } from '@/components/dev-auth-notice';
import { clerkEnabled } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Sign in — BizOpsMate AI',
};

export default async function SignInPage() {
  if (!clerkEnabled) return <DevAuthNotice />;

  const { SignIn } = await import('@clerk/nextjs');
  return <SignIn signUpUrl="/sign-up" forceRedirectUrl="/onboarding" />;
}
