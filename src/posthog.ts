/**
 * PostHog analytics client — singleton for the OpenClawd runtime.
 *
 * Usage:
 *   import { posthog } from './posthog.js'
 *   posthog.capture({ distinctId: pubkey, event: 'leviathan_spawned', properties: { ... } })
 *
 * The distinct ID for this CLI is the leviathan's Solana pubkey (base58).
 * For anonymous / pre-spawn events use the placeholder 'anonymous'.
 */

import { PostHog } from 'posthog-node';

const apiKey = process.env.POSTHOG_API_KEY ?? '';
const host = process.env.POSTHOG_HOST;

export const posthog = new PostHog(apiKey, {
  host,
  enableExceptionAutocapture: true,
});

posthog.on('error', (err: unknown) => {
  // Non-fatal — do not let analytics errors crash the runtime.
  console.warn('[posthog] error:', (err as Error).message ?? err);
});

/**
 * Flush all queued events and shut down the PostHog client.
 * Call this before process.exit() to ensure no events are dropped.
 */
export async function shutdownPosthog(): Promise<void> {
  await posthog.shutdown();
}
