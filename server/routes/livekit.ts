import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";

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

// Convert wss:// URL to https:// for the REST API
function livekitHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss?:\/\//, "https://");
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
  const httpUrl = livekitHttpUrl(LIVEKIT_URL);
  const dispatchClient = new AgentDispatchClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  dispatchClient
    .createDispatch(roomName, LIVEKIT_AGENT_NAME)
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
  });
});

export default router;
