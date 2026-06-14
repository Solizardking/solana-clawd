import { qstash, qstashConfigured, qstashReceiverConfigured } from "../qstash";
import { redis } from "../redis";

type ServiceStatus = {
  configured: boolean;
  connected?: boolean;
  error?: string;
};

type UpstashStatus = {
  redis: ServiceStatus;
  qstash: ServiceStatus & {
    receiverConfigured: boolean;
    baseUrlConfigured: boolean;
  };
  search: ServiceStatus;
  box: ServiceStatus & {
    openclawdBoxConfigured: boolean;
  };
};

const PROBE_TIMEOUT_MS = 2_500;

function hasEnv(name: string) {
  return Boolean((process.env[name] ?? "").trim());
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, "[redacted]")
    .slice(0, 220);
}

function withTimeout<T>(promise: Promise<T>, label: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} probe timed out`)), PROBE_TIMEOUT_MS).unref();
    }),
  ]);
}

export function getUpstashConfigStatus(): UpstashStatus {
  const redisConfigured = hasEnv("UPSTASH_REDIS_REST_URL") && hasEnv("UPSTASH_REDIS_REST_TOKEN");
  const searchConfigured = hasEnv("UPSTASH_SEARCH_REST_URL") && hasEnv("UPSTASH_SEARCH_REST_TOKEN");
  const boxConfigured = hasEnv("UPSTASH_BOX_API_KEY") || hasEnv("NEONBOX_API_KEY");

  return {
    redis: {
      configured: redisConfigured,
    },
    qstash: {
      configured: qstashConfigured,
      receiverConfigured: qstashReceiverConfigured,
      baseUrlConfigured: hasEnv("QSTASH_URL"),
    },
    search: {
      configured: searchConfigured,
    },
    box: {
      configured: boxConfigured,
      openclawdBoxConfigured: hasEnv("UPSTASH_BOX_OPENCLAWD_ID"),
    },
  };
}

export async function getUpstashProbeStatus(): Promise<UpstashStatus> {
  const status = getUpstashConfigStatus();

  if (status.redis.configured) {
    try {
      const pong = await withTimeout(redis.ping(), "Redis");
      status.redis.connected = pong === "PONG";
      if (!status.redis.connected) status.redis.error = "Redis ping returned an unexpected response";
    } catch (error) {
      status.redis.connected = false;
      status.redis.error = sanitizeError(error);
    }
  }

  if (status.qstash.configured) {
    try {
      const logs = await withTimeout(qstash.logs({ count: 1 }), "QStash");
      status.qstash.connected = Array.isArray(logs.logs);
      if (!status.qstash.connected) status.qstash.error = "QStash logs returned an unexpected response";
    } catch (error) {
      status.qstash.connected = false;
      status.qstash.error = sanitizeError(error);
    }
  }

  return status;
}
