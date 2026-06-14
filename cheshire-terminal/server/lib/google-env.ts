export const GOOGLE_AI_KEY_ENV_NAMES = [
  "GOOGLE_API_KEY",
  "GOOGLE_GEN_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_AGENT_API_KEY",
  "GOOGLE_AGENTS_API_KEY",
] as const;

export const GOOGLE_PROJECT_ENV_NAMES = [
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_PROJECT_ID",
  "PROJECT_ID",
] as const;

function readFirstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function getGoogleApiKey(): string | undefined {
  return readFirstEnv(GOOGLE_AI_KEY_ENV_NAMES);
}

export function getGoogleCloudProject(): string | undefined {
  return readFirstEnv(GOOGLE_PROJECT_ENV_NAMES);
}

export function getGoogleCloudLocation(): string {
  return readFirstEnv(["GOOGLE_CLOUD_LOCATION"]) || "us-central1";
}

export function isGoogleVertexExplicitlyEnabled(): boolean {
  const raw = readFirstEnv(["GOOGLE_GENAI_USE_VERTEXAI"]);
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function shouldUseGoogleVertex(): boolean {
  return isGoogleVertexExplicitlyEnabled() || Boolean(getGoogleCloudProject());
}
