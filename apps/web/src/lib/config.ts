export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

/** Clerk is optional in local dev; when unset we run in a header-based dev mode. */
export const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Dev org id used to talk to the API when Clerk is not configured. */
export const DEV_ORG_ID = process.env.DEV_ORG_ID ?? 'org_demo_printpro';
