export interface InstallTrackPayload {
  event: "install" | "agent_install" | "box_install" | "gateway_install";
  source?: string;
  packageName?: string;
  target?: string;
  version?: string;
  gitRef?: string;
  installer?: string;
  runtime?: string;
  platform?: string;
  nodeVersion?: string;
}

export async function trackInstallEvent(payload: InstallTrackPayload): Promise<{ ok: boolean; skipped?: boolean }> {
  if (process.env.CLAWD_DISABLE_TRACKING === "true") return { ok: true, skipped: true };

  const endpoint = process.env.CLAWD_TRACKING_URL ?? "https://x402.wtf/api/track/install";

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.CLAWD_TRACKING_TOKEN) {
    headers["x-clawd-track-token"] = process.env.CLAWD_TRACKING_TOKEN;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  return { ok: response.ok };
}
