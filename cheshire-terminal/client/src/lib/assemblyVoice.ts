export interface AssemblyVoiceStatus {
  configured: boolean;
  env: string | null;
  defaultModel: string;
  endpoints: {
    llmGateway: string;
    streaming: string;
    voiceAgent: string;
  };
}

export interface AssemblyTranscriptResponse {
  text: string;
  transcriptId: string;
  words?: unknown[];
  utterances?: unknown[];
  raw?: unknown;
}

export interface AssemblyVoicePromptResponse {
  text: string;
  transcriptId: string;
  intent: {
    prompt: string;
    mode: string;
    intent: string;
    safety_note: string;
  } | null;
  response?: unknown;
}

async function throwIfBad(response: Response) {
  if (response.ok) return;
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.error || payload.message || `Voice request failed: ${response.status}`);
}

export async function getAssemblyVoiceStatus(): Promise<AssemblyVoiceStatus> {
  const response = await fetch("/api/voice/status", { credentials: "include" });
  await throwIfBad(response);
  return response.json();
}

export async function getAssemblyVoiceAgentToken() {
  const response = await fetch("/api/voice/agent-token?expires_in_seconds=60&max_session_duration_seconds=3600", {
    credentials: "include",
  });
  await throwIfBad(response);
  return response.json() as Promise<{ token: string; expires_in_seconds: number }>;
}

export async function transcribeWithAssemblyAI(
  audio: Blob,
  options: { language?: string } = {},
): Promise<AssemblyTranscriptResponse> {
  const form = new FormData();
  form.append("audio", audio, "voice.webm");
  form.append("language", options.language || "en");

  const response = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  await throwIfBad(response);
  return response.json();
}

export async function promptWithAssemblyAI(
  audio: Blob,
  options: { language?: string; mode?: string; context?: string } = {},
): Promise<AssemblyVoicePromptResponse> {
  const form = new FormData();
  form.append("audio", audio, "voice.webm");
  form.append("language", options.language || "en");
  form.append("mode", options.mode || "chat");
  if (options.context) form.append("context", options.context);

  const response = await fetch("/api/voice/prompt", {
    method: "POST",
    body: form,
    credentials: "include",
  });
  await throwIfBad(response);
  return response.json();
}

export async function chatWithAssemblyGateway(messages: Array<{ role: string; content: string }>) {
  const response = await fetch("/api/voice/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      messages,
      max_tokens: 1000,
      temperature: 0.4,
    }),
  });
  await throwIfBad(response);
  return response.json();
}
