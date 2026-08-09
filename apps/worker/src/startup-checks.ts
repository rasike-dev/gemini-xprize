/**
 * Boot-time configuration check for the worker.
 *
 * The agents fall back to deterministic mock output when no AI credentials are
 * present. That is what makes local development pleasant and is also the most
 * dangerous silent failure in the system: a production worker with no key would
 * report every run as COMPLETED while inventing the figures it sends to customers.
 */
export function assertAiConfigIsSafe(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (!process.env.GEMINI_API_KEY && !process.env.VERTEX_PROJECT_ID) {
    throw new Error(
      'No AI credentials configured. Set GEMINI_API_KEY or VERTEX_PROJECT_ID. ' +
        'Without them every agent silently returns mock output.',
    );
  }
}
