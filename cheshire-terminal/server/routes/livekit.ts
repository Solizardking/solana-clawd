import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import {
  AccessToken,
  AgentDispatchClient,
  EgressClient,
  IngressClient,
  IngressInput,
  RoomServiceClient,
  StreamOutput,
  StreamProtocol,
} from "livekit-server-sdk";

const router = Router();

/**
 * LiveKit webhook receiver.
 *
 * LiveKit sends webhook events (room_started, participant_joined, 
 * track_published, etc.) as HTTP POST with an Authorization header
 * containing a signed JWT. We validate it using the LiveKit API key/secret.
 *
 * Configure this URL in LiveKit Cloud:
 *   Settings → Webhooks → URL: https://yoursite.com/api/livekit/webhook
 *   Signing API Key: use your LIVEKIT_API_KEY
 */

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

/**
 * Naive JWT verification for LiveKit webhooks.
 * LiveKit signs the payload with HS256 using the API secret.
 */
function verifyLiveKitToken(authHeader: string | undefined, body: string): boolean {
  if (!authHeader || !LIVEKIT_API_SECRET) return false;

  try {
    // LiveKit uses a standard JWT in the Authorization header
    const parts = authHeader.split(".");
    if (parts.length !== 3) return false;

    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));

    // Verify the signature
    const signature = parts[2];
    const expectedSig = crypto
      .createHmac("sha256", LIVEKIT_API_SECRET)
      .update(`${parts[0]}.${parts[1]}`)
      .digest("base64url");

    if (signature !== expectedSig) {
      console.warn("[livekit-webhook] JWT signature mismatch");
      return false;
    }

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.warn("[livekit-webhook] JWT expired");
      return false;
    }

    // Optional: verify the SHA256 hash of the body matches
    if (payload.sha256) {
      const bodyHash = crypto.createHash("sha256").update(body).digest("base64");
      if (payload.sha256 !== bodyHash) {
        console.warn("[livekit-webhook] body hash mismatch");
        return false;
      }
    }

    return true;
  } catch (err) {
    console.warn("[livekit-webhook] verification error:", err);
    return false;
  }
}

const LIVEKIT_URL = process.env.LIVEKIT_URL || "wss://solanaos-zn3w8h4f.livekit.cloud";
const LIVEKIT_AGENT_NAME = process.env.LIVEKIT_AGENT_ID || "CA_xk8hpixq4g6K";
const LIVEKIT_LIVESTREAM_ROOM = process.env.LIVEKIT_LIVESTREAM_ROOM || "cheshire-terminal-live";
const LIVEKIT_ROOM_RE = /^[a-zA-Z0-9_-]{3,96}$/;
const LIVEKIT_INGRESS_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;
const LIVEKIT_EGRESS_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;
const LIVEKIT_EGRESS_LAYOUTS = new Set(["grid", "speaker", "single-speaker"]);

// Convert wss:// URL to https:// for the REST API
function livekitHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss?:\/\//, "https://");
}

function getLivekitHttpUrl() {
  return livekitHttpUrl(LIVEKIT_URL);
}

function sanitizeRoomName(value: unknown, fallback = LIVEKIT_LIVESTREAM_ROOM) {
  const roomName = typeof value === "string" ? value.trim() : "";
  return LIVEKIT_ROOM_RE.test(roomName) ? roomName : fallback;
}

function sanitizeParticipantName(value: unknown, fallbackPrefix: string) {
  const requested = typeof value === "string" ? value.trim() : "";
  const normalized = requested.replace(/[^a-zA-Z0-9_.@-]/g, "-").slice(0, 64);
  return normalized || `${fallbackPrefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function createAgentDispatch(roomName: string) {
  const dispatchClient = new AgentDispatchClient(getLivekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  return dispatchClient.createDispatch(roomName, LIVEKIT_AGENT_NAME);
}

function summarizeIngress(ingress: any) {
  return {
    ingressId: ingress.ingressId,
    name: ingress.name,
    roomName: ingress.roomName,
    participantIdentity: ingress.participantIdentity,
    participantName: ingress.participantName,
    inputType: ingress.inputType,
    url: ingress.url,
    status: ingress.state?.status,
    startedAt: ingress.state?.startedAt,
    endedAt: ingress.state?.endedAt,
    tracks: ingress.state?.tracks?.length ?? 0,
  };
}

function sanitizeEgressLayout(value: unknown) {
  const layout = typeof value === "string" ? value.trim() : "";
  return LIVEKIT_EGRESS_LAYOUTS.has(layout) ? layout : "grid";
}

function parseRtmpDestination(value: unknown) {
  const rtmpUrl = typeof value === "string" ? value.trim() : "";
  if (!rtmpUrl || rtmpUrl.length > 1024) return null;

  try {
    const parsed = new URL(rtmpUrl);
    if (parsed.protocol !== "rtmp:" && parsed.protocol !== "rtmps:") return null;
    return {
      url: rtmpUrl,
      host: parsed.host,
      protocol: parsed.protocol.replace(":", ""),
    };
  } catch {
    return null;
  }
}

function summarizeEgress(egress: any) {
  return {
    egressId: egress.egressId,
    roomName: egress.roomName,
    status: egress.status,
    layout: egress.layout,
    startedAt: egress.startedAt,
    endedAt: egress.endedAt,
    updatedAt: egress.updatedAt,
    error: egress.error,
    streamResults: Array.isArray(egress.streamResults)
      ? egress.streamResults.map((result: any) => ({
          status: result.status,
          startedAt: result.startedAt,
          endedAt: result.endedAt,
          duration: result.duration,
          error: result.error,
        }))
      : [],
  };
}

function summarizeParticipant(participant: any) {
  return {
    sid: participant.sid,
    identity: participant.identity,
    name: participant.name,
    kind: participant.kind,
    state: participant.state,
    joinedAt: participant.joinedAt,
    trackCount: participant.tracks?.length ?? 0,
    publishedTracks: Array.isArray(participant.tracks)
      ? participant.tracks.map((track: any) => ({
          sid: track.sid,
          type: track.type,
          name: track.name,
          source: track.source,
          muted: track.muted,
        }))
      : [],
  };
}

/**
 * POST /api/livekit/token
 *
 * Mint a short-lived participant JWT and dispatch the Clawd agent to the room
 * so Fly.io workers pick up the session automatically.
 *
 * Body: { roomName?: string; participantName?: string }
 */
router.post("/token", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured" });
  }

  const roomName = (req.body?.roomName as string | undefined) || "clawd-voice";
  const participantName =
    (req.body?.participantName as string | undefined) ||
    `user-${crypto.randomBytes(4).toString("hex")}`;

  // 1. Mint participant token
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: "1h",
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });
  const token = await at.toJwt();

  // 2. Dispatch the Clawd agent to this room (fire-and-forget — don't block the response)
  createAgentDispatch(roomName)
    .then(() => {
      console.log(`[livekit] dispatched agent ${LIVEKIT_AGENT_NAME} to room ${roomName}`);
    })
    .catch((err: unknown) => {
      // Agent may already be in the room or dispatched — not fatal
      console.warn(`[livekit] dispatch skipped:`, err instanceof Error ? err.message : err);
    });

  return res.json({
    token,
    url: LIVEKIT_URL,
    roomName,
    agentName: LIVEKIT_AGENT_NAME,
  });
});

/**
 * POST /api/livekit/livestream-token
 *
 * Mint a short-lived token for the low-latency livestream surface.
 * Viewers are subscribe-only. Hosts can publish browser camera/microphone.
 *
 * Body: { roomName?: string; participantName?: string; role?: "viewer" | "host" | "agent"; dispatchAgent?: boolean }
 */
router.post("/livestream-token", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured" });
  }

  const roomName = sanitizeRoomName(req.body?.roomName);
  const role = req.body?.role === "host" || req.body?.role === "agent" ? req.body.role : "viewer";
  const participantName = sanitizeParticipantName(req.body?.participantName, role);
  const canPublish = role === "host" || role === "agent";

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: "2h",
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: canPublish,
    canUpdateOwnMetadata: true,
  });

  const token = await at.toJwt();

  if (role === "agent" || req.body?.dispatchAgent === true) {
    createAgentDispatch(roomName)
      .then(() => {
        console.log(`[livekit] dispatched livestream agent ${LIVEKIT_AGENT_NAME} to room ${roomName}`);
      })
      .catch((err: unknown) => {
        console.warn(`[livekit] livestream dispatch skipped:`, err instanceof Error ? err.message : err);
      });
  }

  return res.json({
    token,
    url: LIVEKIT_URL,
    roomName,
    participantName,
    role,
  });
});

/**
 * POST /api/livekit/livestream-ingress
 *
 * Create an RTMP or WHIP ingress that publishes as an agent participant into
 * the livestream room. This mirrors the LiveKit ingress sample flow while
 * keeping creation inside the app API.
 *
 * Body: { roomName?: string; agentName?: string; protocol?: "rtmp" | "whip" }
 */
router.post("/livestream-ingress", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured" });
  }

  const roomName = sanitizeRoomName(req.body?.roomName);
  const protocol = req.body?.protocol === "whip" ? "whip" : "rtmp";
  const agentName = sanitizeParticipantName(req.body?.agentName, "agent");
  const ingressClient = new IngressClient(getLivekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    const ingress = await ingressClient.createIngress(
      protocol === "whip" ? IngressInput.WHIP_INPUT : IngressInput.RTMP_INPUT,
      {
        name: `${agentName} ${protocol.toUpperCase()} stream`,
        roomName,
        participantIdentity: agentName,
        participantName: agentName,
        participantMetadata: JSON.stringify({ source: "cheshire-terminal", role: "agent-stream" }),
        enableTranscoding: protocol === "rtmp",
      }
    );

    return res.json({
      protocol,
      roomName,
      agentName,
      ingressId: ingress.ingressId,
      url: ingress.url,
      streamKey: ingress.streamKey,
      status: ingress.state?.status,
      raw: ingress.toJson?.() ?? ingress,
    });
  } catch (err: any) {
    console.error("[livekit] failed to create livestream ingress:", err);
    return res.status(502).json({ error: err?.message || "Unable to create LiveKit ingress." });
  }
});

/**
 * GET /api/livekit/livestream-ingresses
 *
 * List LiveKit ingress endpoints for the livestream room without returning
 * stream keys. Use POST /livestream-ingress to create/copy a fresh key.
 */
router.get("/livestream-ingresses", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured", items: [] });
  }

  const roomName = sanitizeRoomName(req.query.roomName);
  const ingressClient = new IngressClient(getLivekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    const items = await ingressClient.listIngress({ roomName });
    return res.json({
      roomName,
      items: items.map(summarizeIngress),
    });
  } catch (err: any) {
    console.error("[livekit] failed to list livestream ingresses:", err);
    return res.status(502).json({ error: err?.message || "Unable to list LiveKit ingresses.", items: [] });
  }
});

/**
 * DELETE /api/livekit/livestream-ingresses/:ingressId
 *
 * Delete a stale LiveKit ingress endpoint by id. This is useful after RTMP/WHIP
 * test streams so reusable keys do not linger.
 */
router.delete("/livestream-ingresses/:ingressId", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured" });
  }

  const ingressId = typeof req.params.ingressId === "string" ? req.params.ingressId.trim() : "";
  if (!LIVEKIT_INGRESS_ID_RE.test(ingressId)) {
    return res.status(400).json({ error: "Invalid ingress id" });
  }

  const ingressClient = new IngressClient(getLivekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    const deleted = await ingressClient.deleteIngress(ingressId);
    return res.json({
      deleted: true,
      ingress: summarizeIngress(deleted),
    });
  } catch (err: any) {
    console.error("[livekit] failed to delete livestream ingress:", err);
    return res.status(502).json({ error: err?.message || "Unable to delete LiveKit ingress." });
  }
});

/**
 * POST /api/livekit/livestream-egress
 *
 * Start a RoomComposite egress for the livestream room to an RTMP/RTMPS
 * destination. Destination URLs often include stream keys, so responses only
 * include host/protocol metadata and LiveKit status.
 *
 * Body: { roomName?: string; rtmpUrl: string; layout?: "grid" | "speaker" | "single-speaker" }
 */
router.post("/livestream-egress", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured" });
  }

  const destination = parseRtmpDestination(req.body?.rtmpUrl);
  if (!destination) {
    return res.status(400).json({ error: "Enter a valid RTMP or RTMPS destination URL." });
  }

  const roomName = sanitizeRoomName(req.body?.roomName);
  const layout = sanitizeEgressLayout(req.body?.layout);
  const egressClient = new EgressClient(getLivekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const output = new StreamOutput({
    protocol: StreamProtocol.RTMP,
    urls: [destination.url],
  });

  try {
    const egress = await egressClient.startRoomCompositeEgress(roomName, output, { layout } as any);
    return res.json({
      roomName,
      destinationHost: destination.host,
      destinationProtocol: destination.protocol,
      egress: summarizeEgress(egress),
    });
  } catch (err: any) {
    console.error("[livekit] failed to start livestream egress:", err);
    return res.status(502).json({ error: err?.message || "Unable to start LiveKit egress." });
  }
});

/**
 * GET /api/livekit/livestream-egresses
 *
 * List egress jobs for the livestream room without returning destination URLs.
 */
router.get("/livestream-egresses", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured", items: [] });
  }

  const roomName = sanitizeRoomName(req.query.roomName);
  const egressClient = new EgressClient(getLivekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    const items = await egressClient.listEgress({ roomName });
    return res.json({
      roomName,
      items: items.map(summarizeEgress),
    });
  } catch (err: any) {
    console.error("[livekit] failed to list livestream egresses:", err);
    return res.status(502).json({ error: err?.message || "Unable to list LiveKit egresses.", items: [] });
  }
});

/**
 * POST /api/livekit/livestream-egresses/:egressId/stop
 *
 * Stop an active LiveKit egress by id.
 */
router.post("/livestream-egresses/:egressId/stop", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured" });
  }

  const egressId = typeof req.params.egressId === "string" ? req.params.egressId.trim() : "";
  if (!LIVEKIT_EGRESS_ID_RE.test(egressId)) {
    return res.status(400).json({ error: "Invalid egress id" });
  }

  const egressClient = new EgressClient(getLivekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    const stopped = await egressClient.stopEgress(egressId);
    return res.json({
      stopped: true,
      egress: summarizeEgress(stopped),
    });
  } catch (err: any) {
    console.error("[livekit] failed to stop livestream egress:", err);
    return res.status(502).json({ error: err?.message || "Unable to stop LiveKit egress." });
  }
});

/**
 * GET /api/livekit/livestream-room
 *
 * Inspect the active LiveKit livestream room. This is the runtime signal used by
 * the streaming page to distinguish "tokens mint" from "media is actually in
 * the room".
 */
router.get("/livestream-room", async (req: Request, res: Response) => {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: "LiveKit not configured", exists: false, participants: [] });
  }

  const roomName = sanitizeRoomName(req.query.roomName);
  const roomClient = new RoomServiceClient(getLivekitHttpUrl(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    const [rooms, participants] = await Promise.all([
      roomClient.listRooms([roomName]),
      roomClient.listParticipants(roomName).catch((err: any) => {
        if (err?.status === 404 || err?.code === "not_found") return [];
        throw err;
      }),
    ]);
    const room = rooms.find((item: any) => item.name === roomName) ?? null;
    const summarizedParticipants = participants.map(summarizeParticipant);
    const publishers = summarizedParticipants.filter((participant) => participant.trackCount > 0);

    return res.json({
      roomName,
      exists: Boolean(room),
      sid: room?.sid,
      creationTime: room?.creationTime,
      numParticipants: room?.numParticipants ?? summarizedParticipants.length,
      numPublishers: publishers.length,
      numTracks: summarizedParticipants.reduce((total, participant) => total + participant.trackCount, 0),
      participants: summarizedParticipants,
    });
  } catch (err: any) {
    console.error("[livekit] failed to inspect livestream room:", err);
    return res.status(502).json({ error: err?.message || "Unable to inspect LiveKit room.", exists: false, participants: [] });
  }
});

/**
 * POST /api/livekit/webhook
 *
 * Receives webhook events from LiveKit Cloud.
 * Body is a WebhookEvent JSON payload.
 * Content-Type: application/webhook+json
 */
router.post("/webhook", async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (!verifyLiveKitToken(req.headers.authorization, rawBody)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const event = req.body as {
    event: string;
    id?: string;
    createdAt?: number;
    room?: { sid?: string; name?: string; emptyTimeout?: number };
    participant?: { sid?: string; identity?: string; name?: string };
    track?: { sid?: string; type?: string; name?: string; source?: string };
  };

  console.log(`[livekit-webhook] event=${event.event} room=${event.room?.name || event.room?.sid || "?"}`);

  try {
    switch (event.event) {
      case "room_started": {
        console.log(`[livekit-webhook] Room started: ${event.room?.name} (${event.room?.sid})`);
        break;
      }

      case "room_finished": {
        console.log(`[livekit-webhook] Room finished: ${event.room?.name}`);
        break;
      }

      case "participant_joined": {
        console.log(
          `[livekit-webhook] Participant joined: ${event.participant?.identity} in room ${event.room?.name}`
        );
        break;
      }

      case "participant_left": {
        console.log(
          `[livekit-webhook] Participant left: ${event.participant?.identity} from room ${event.room?.name}`
        );
        break;
      }

      case "track_published": {
        console.log(
          `[livekit-webhook] Track published: ${event.track?.type}/${event.track?.name} by ${event.participant?.identity}`
        );
        break;
      }

      case "track_unpublished": {
        console.log(
          `[livekit-webhook] Track unpublished: ${event.track?.type}/${event.track?.name} by ${event.participant?.identity}`
        );
        break;
      }

      case "egress_started":
      case "egress_updated":
      case "egress_ended": {
        console.log(`[livekit-webhook] Egress ${event.event}: room=${event.room?.name}`);
        break;
      }

      case "ingress_started":
      case "ingress_ended": {
        console.log(`[livekit-webhook] Ingress ${event.event}: room=${event.room?.name}`);
        break;
      }

      default: {
        console.log(`[livekit-webhook] Unhandled event: ${event.event}`);
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("[livekit-webhook] error processing event:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
});

/**
 * GET /api/livekit/status
 */
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    configured: !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET),
    projectId: process.env.LIVEKIT_PROJECT_ID || null,
    sipUri: process.env.LIVEKIT_SIP_URI || null,
    url: LIVEKIT_URL,
    agentName: LIVEKIT_AGENT_NAME,
    livestreamRoom: LIVEKIT_LIVESTREAM_ROOM,
  });
});

export default router;
