export const MODELS = [
  { id: "z-ai/glm-5.2", label: "GLM 5.2", description: "OpenRouter default" },
] as const;

export const DEFAULT_MODEL = "z-ai/glm-5.2";

export const API_ROUTES = {
  chat: "/api/chat",
  stream: "/api/stream",
} as const;

export const MAX_MESSAGE_LENGTH = 100_000;

export const STREAMING_CHUNK_SIZE = 64;
