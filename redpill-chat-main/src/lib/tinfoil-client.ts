import { TinfoilAI } from "tinfoil";

const PLACEHOLDER_API_KEY = "tinfoil-placeholder-api-key";

let clientInstance: TinfoilAI | null = null;

async function initClient(apiKey: string): Promise<TinfoilAI> {
  clientInstance = new TinfoilAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });
  return clientInstance;
}

export async function getTinfoilClient(): Promise<TinfoilAI> {
  if (!clientInstance) {
    await initClient(PLACEHOLDER_API_KEY);
  }

  if (!clientInstance) {
    throw new Error("Tinfoil client not initialized");
  }
  return clientInstance;
}

export async function initializeTinfoilClient(): Promise<void> {
  const client = await getTinfoilClient();
  try {
    await (
      client as {
        ready?: () => Promise<unknown>;
      }
    ).ready?.();
  } catch (error) {
    console.error("Tinfoil client initialization failed", error);
  }
}
