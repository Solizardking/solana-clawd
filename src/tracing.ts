import OpenAI from 'openai';
import { setup, type CatalystTracing } from '@inference/tracing';

let tracingPromise: Promise<CatalystTracing> | null = null;

export function initTracing(): Promise<CatalystTracing> {
  if (!tracingPromise) {
    tracingPromise = setup({ modules: { openai: OpenAI } });
  }
  return tracingPromise;
}

export async function shutdownTracing(): Promise<void> {
  if (!tracingPromise) return;
  const tracing = await tracingPromise;
  await tracing.shutdown();
}
