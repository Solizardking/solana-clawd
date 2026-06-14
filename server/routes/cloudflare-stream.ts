import express, { type Request, type Response as ExpressResponse } from "express";
import multer from "multer";

const router = express.Router();

const DEFAULT_ACCOUNT_ID = "2f5db575118d15ec19000e13282201bc";
const DEFAULT_CUSTOMER_SUBDOMAIN = "customer-oh7hxjdpro3mt496.cloudflarestream.com";
const STREAM_API_BASE = "https://api.cloudflare.com/client/v4";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const liveInputBuckets = new Map<string, { count: number; resetAt: number }>();
const LIVE_INPUT_WINDOW_MS = 60 * 60 * 1000;
const LIVE_INPUT_MAX_PER_WINDOW = Number(process.env.CLOUDFLARE_STREAM_PUBLIC_LIVE_INPUT_LIMIT || 5);

function getConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;
  const customerSubdomain =
    process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN ||
    process.env.CLOUDFLARE_SUBDOMAIN ||
    DEFAULT_CUSTOMER_SUBDOMAIN;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN || process.env.CLOUDFLARE_API_TOKEN || process.env.TOKEN;
  const tokenSource = process.env.CLOUDFLARE_STREAM_TOKEN
    ? "CLOUDFLARE_STREAM_TOKEN"
    : process.env.CLOUDFLARE_API_TOKEN
      ? "CLOUDFLARE_API_TOKEN"
      : process.env.TOKEN
        ? "TOKEN"
        : null;
  return { accountId, customerSubdomain, token, tokenSource };
}

function clientIp(req: Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  return (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
    ?.split(",")[0]
    ?.trim() || req.ip || req.socket.remoteAddress || "unknown";
}

function liveInputRateLimited(req: Request) {
  const now = Date.now();
  const ip = clientIp(req);
  const bucket = liveInputBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    liveInputBuckets.set(ip, { count: 1, resetAt: now + LIVE_INPUT_WINDOW_MS });
    return false;
  }
  if (bucket.count >= LIVE_INPUT_MAX_PER_WINDOW) return true;
  bucket.count += 1;
  return false;
}

function playbackUrls(uid: string, customerSubdomain: string) {
  return {
    iframe: `https://${customerSubdomain}/${uid}/iframe`,
    hls: `https://${customerSubdomain}/${uid}/manifest/video.m3u8`,
    dash: `https://${customerSubdomain}/${uid}/manifest/video.mpd`,
    thumbnail: `https://${customerSubdomain}/${uid}/thumbnails/thumbnail.jpg`,
  };
}

function isSafeStreamUid(uid: string) {
  return /^[a-zA-Z0-9_-]{16,128}$/.test(uid);
}

async function probeUrl(url: string, init: RequestInit = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "*/*",
        ...init.headers,
      },
    });
    const text = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      contentType: response.headers.get("content-type"),
      bytes: text.length,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: error?.name === "AbortError" ? "Request timed out." : "Request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function cloudflareFetch(path: string, init: RequestInit = {}) {
  const { accountId, token } = getConfig();
  if (!token) {
    return new Response(
      JSON.stringify({
        success: false,
        errors: [{ message: "Cloudflare Stream token is not configured." }],
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${STREAM_API_BASE}/accounts/${accountId}${path}`, {
    ...init,
    headers,
  });
}

async function forwardJson(res: ExpressResponse, upstream: globalThis.Response) {
  const text = await upstream.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { success: false, errors: [{ message: text || "Cloudflare returned a non-JSON response." }] };
  }
  return res.status(upstream.status).json(body);
}

function publicLiveInput(input: any, customerSubdomain: string) {
  const uid = input?.uid || input?.id;
  return {
    ...input,
    playback: uid ? playbackUrls(uid, customerSubdomain) : null,
  };
}

router.get("/status", (_req, res) => {
  const { accountId, customerSubdomain, token, tokenSource } = getConfig();
  res.json({
    accountId,
    customerSubdomain,
    configured: Boolean(token),
    liveInputsEnabled: Boolean(token),
    tokenSource,
    publicLiveInputLimit: LIVE_INPUT_MAX_PER_WINDOW,
    liveInputWindowSeconds: LIVE_INPUT_WINDOW_MS / 1000,
  });
});

router.get("/playback/:uid", async (req, res) => {
  const uid = String(req.params.uid || "").trim();
  if (!isSafeStreamUid(uid)) {
    return res.status(400).json({ error: "Invalid Stream input id." });
  }

  const { customerSubdomain } = getConfig();
  return res.json({
    uid,
    playback: playbackUrls(uid, customerSubdomain),
  });
});

router.get("/health/:uid", async (req, res) => {
  const uid = String(req.params.uid || "").trim();
  if (!isSafeStreamUid(uid)) {
    return res.status(400).json({ ok: false, error: "Invalid Stream input id." });
  }

  const { customerSubdomain } = getConfig();
  const playback = playbackUrls(uid, customerSubdomain);
  const [hls, iframe, thumbnail] = await Promise.all([
    probeUrl(playback.hls),
    probeUrl(playback.iframe),
    probeUrl(playback.thumbnail),
  ]);
  const liveReady = hls.ok && hls.contentType?.includes("mpegurl");

  return res.json({
    uid,
    ok: Boolean(hls.ok || iframe.ok),
    liveReady: Boolean(liveReady),
    checkedAt: new Date().toISOString(),
    playback,
    checks: { hls, iframe, thumbnail },
  });
});

router.get("/views/:uid", async (req, res) => {
  const uid = String(req.params.uid || "").trim();
  if (!isSafeStreamUid(uid)) {
    return res.status(400).json({ liveViewers: 0, error: "Invalid Stream input id." });
  }

  const { customerSubdomain } = getConfig();
  try {
    const upstream = await fetch(`https://${customerSubdomain}/${uid}/views`, {
      headers: { Accept: "application/json" },
    });
    const text = await upstream.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }

    if (upstream.status === 404) {
      return res.json({ liveViewers: 0 });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        liveViewers: 0,
        error: body?.error || body?.message || "Unable to load live viewer count.",
      });
    }

    return res.json({
      liveViewers: Number.isFinite(Number(body.liveViewers)) ? Number(body.liveViewers) : 0,
    });
  } catch {
    return res.status(502).json({ liveViewers: 0, error: "Cloudflare viewer count request failed." });
  }
});

router.get("/videos", async (_req, res) => {
  const upstream = await cloudflareFetch("/stream?limit=20");
  const body = await upstream.json();
  if (!upstream.ok) return res.status(upstream.status).json(body);

  const { customerSubdomain } = getConfig();
  const videos = Array.isArray(body.result)
    ? body.result.map((video: any) => ({
        ...video,
        playback: video.uid ? playbackUrls(video.uid, customerSubdomain) : null,
      }))
    : [];

  return res.json({ ...body, result: videos });
});

router.post("/live-inputs", async (req, res) => {
  if (liveInputRateLimited(req)) {
    return res.status(429).json({
      success: false,
      errors: [{ message: "Too many live inputs created from this network. Please try again later." }],
    });
  }

  const name = typeof req.body?.name === "string" && req.body.name.trim()
    ? req.body.name.trim().slice(0, 80)
    : "cheshireterminal";
  const creator = typeof req.body?.creator === "string" && req.body.creator.trim()
    ? req.body.creator.trim().slice(0, 80)
    : "guest";

  const upstream = await cloudflareFetch("/stream/live_inputs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meta: { name, creator, source: "cheshireterminal" },
      recording: { mode: "automatic", requireSignedURLs: false },
    }),
  });

  const text = await upstream.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { success: false, errors: [{ message: text || "Cloudflare returned a non-JSON response." }] };
  }

  if (!upstream.ok || !body?.success) return res.status(upstream.status).json(body);

  const { customerSubdomain } = getConfig();
  return res.status(upstream.status).json({
    ...body,
    result: publicLiveInput(body.result, customerSubdomain),
  });
});

router.post("/direct-upload", async (req, res) => {
  const maxDurationSeconds = Number(req.body?.maxDurationSeconds || 3600);
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const upstream = await cloudflareFetch("/stream/direct_upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maxDurationSeconds: Number.isFinite(maxDurationSeconds) ? maxDurationSeconds : 3600,
      expiry,
      requireSignedURLs: false,
      meta: { name: req.body?.name || "cheshireterminal-upload" },
    }),
  });

  return forwardJson(res, upstream);
});

router.post("/copy", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!/^https?:\/\/.+/i.test(url)) {
    return res.status(400).json({ success: false, errors: [{ message: "A valid video URL is required." }] });
  }

  const upstream = await cloudflareFetch("/stream/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      requireSignedURLs: false,
      meta: { name: req.body?.name || "cheshireterminal-link-upload" },
    }),
  });

  return forwardJson(res, upstream);
});

router.post("/upload", upload.single("file"), async (req: Request, res: ExpressResponse) => {
  if (!req.file) {
    return res.status(400).json({ success: false, errors: [{ message: "No video file uploaded." }] });
  }

  const form = new FormData();
  form.set("file", new Blob([req.file.buffer], { type: req.file.mimetype || "application/octet-stream" }), req.file.originalname);

  const upstream = await cloudflareFetch("/stream", {
    method: "POST",
    body: form,
  });

  return forwardJson(res, upstream);
});

export default router;
