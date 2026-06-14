import { Router, type Request } from "express";
import { nanoid } from "nanoid";
import { createApiKeySecret, getApiKeyPrefix, hashApiKey, resolveApiPrincipal } from "../lib/api-auth";
import { db, hasDatabase } from "../db";
import { apiKeys } from "../../drizzle/schema";

const router = Router();

type ParticipantType = "human" | "agent";
type RoomMode = "OPEN" | "INVITE";
type RoomVisibility = "PUBLIC" | "PRIVATE";

type Participant = {
  id: string;
  name: string;
  type: ParticipantType;
  identity: string;
  joinedAt: string;
};

type ArenaMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderType: ParticipantType;
  content: string;
  createdAt: string;
};

type ArenaRoom = {
  id: string;
  inviteCode: string;
  topic: string;
  status: "open" | "active" | "complete";
  joinMode: RoomMode;
  visibility: RoomVisibility;
  maxAgents: number;
  maxRounds: number;
  tags: string[];
  creatorIdentity: string;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  messages: ArenaMessage[];
};

const rooms = new Map<string, ArenaRoom>();

function nowIso() {
  return new Date().toISOString();
}

function principalIdentity(req: Request) {
  const principal = req.apiPrincipal;
  if (!principal) return "public";
  if (principal.type === "clerk-user") return `clerk:${principal.clerkUserId}`;
  if (principal.type === "wallet-session") return `wallet:${principal.walletAddress}`;
  return `api-key:${principal.apiKeyId}`;
}

function displayName(req: Request, fallback = "Arena participant") {
  const bodyName = String(req.body?.displayName ?? req.body?.name ?? "").trim();
  if (bodyName) return bodyName.slice(0, 64);
  const principal = req.apiPrincipal;
  if (principal?.type === "clerk-user" && principal.email) return principal.email.split("@")[0].slice(0, 64);
  if (principal?.type === "wallet-session") return `${principal.walletAddress.slice(0, 4)}...${principal.walletAddress.slice(-4)}`;
  if (principal?.type === "api-key") return `Agent ${principal.keyPrefix.slice(-4)}`;
  return fallback;
}

function summarizeRoom(room: ArenaRoom) {
  return {
    ...room,
    messages: room.messages.slice(-40),
    participantCount: room.participants.length,
  };
}

function requireRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) {
    const error = new Error("Arena room not found");
    (error as any).status = 404;
    throw error;
  }
  return room;
}

function seedRooms() {
  if (rooms.size) return;
  const createdAt = nowIso();
  const samples: ArenaRoom[] = [
    {
      id: "room-solana-agents",
      inviteCode: "SOLANA",
      topic: "Can Solana-native agents coordinate markets without a central operator?",
      status: "open",
      joinMode: "OPEN",
      visibility: "PUBLIC",
      maxAgents: 4,
      maxRounds: 5,
      tags: ["solana", "agents", "coordination"],
      creatorIdentity: "system",
      createdAt,
      updatedAt: createdAt,
      participants: [],
      messages: [],
    },
    {
      id: "room-clawd-lab",
      inviteCode: "CLAWD",
      topic: "What should an agent prove before users trust it with capital?",
      status: "open",
      joinMode: "OPEN",
      visibility: "PUBLIC",
      maxAgents: 3,
      maxRounds: 4,
      tags: ["clawd", "trust", "reputation"],
      creatorIdentity: "system",
      createdAt,
      updatedAt: createdAt,
      participants: [],
      messages: [],
    },
  ];
  for (const room of samples) rooms.set(room.id, room);
}

seedRooms();

router.get("/rooms", (_req, res) => {
  const publicRooms = Array.from(rooms.values())
    .filter((room) => room.visibility === "PUBLIC")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50)
    .map(summarizeRoom);
  res.json({ rooms: publicRooms });
});

router.get("/rooms/:roomId", (req, res) => {
  try {
    res.json({ room: summarizeRoom(requireRoom(req.params.roomId)) });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Failed to load room" });
  }
});

router.post("/rooms", async (req, res) => {
  const principal = await resolveApiPrincipal(req);
  if (!principal) return res.status(401).json({ error: "Sign in with Clerk, wallet, or a Cheshire API key to create arena rooms." });

  const topic = String(req.body?.topic ?? req.body?.name ?? "").trim().slice(0, 180);
  if (!topic) return res.status(400).json({ error: "Room topic is required." });

  const room: ArenaRoom = {
    id: `room_${nanoid(10)}`,
    inviteCode: nanoid(8).toUpperCase(),
    topic,
    status: "open",
    joinMode: req.body?.joinMode === "INVITE" ? "INVITE" : "OPEN",
    visibility: req.body?.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    maxAgents: Math.min(8, Math.max(2, Number(req.body?.maxAgents ?? 4) || 4)),
    maxRounds: Math.min(20, Math.max(1, Number(req.body?.maxRounds ?? 5) || 5)),
    tags: Array.isArray(req.body?.tags)
      ? req.body.tags.filter((tag: unknown): tag is string => typeof tag === "string").slice(0, 8)
      : String(req.body?.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
    creatorIdentity: principalIdentity(req),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    participants: [],
    messages: [],
  };
  rooms.set(room.id, room);
  res.status(201).json({ room: summarizeRoom(room) });
});

router.post("/rooms/:roomId/join", async (req, res) => {
  const principal = await resolveApiPrincipal(req);
  if (!principal) return res.status(401).json({ error: "Sign in with Clerk, wallet, or a Cheshire API key to join." });

  try {
    const room = requireRoom(req.params.roomId);
    const identity = principalIdentity(req);
    const type: ParticipantType = req.body?.type === "agent" || principal.type === "api-key" ? "agent" : "human";
    let participant = room.participants.find((item) => item.identity === identity);
    if (!participant) {
      participant = {
        id: `p_${nanoid(10)}`,
        name: displayName(req, type === "agent" ? "Arena agent" : "Arena human"),
        type,
        identity,
        joinedAt: nowIso(),
      };
      room.participants.push(participant);
      room.updatedAt = nowIso();
    }
    res.json({ room: summarizeRoom(room), participant });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Failed to join room" });
  }
});

router.post("/rooms/:roomId/messages", async (req, res) => {
  const principal = await resolveApiPrincipal(req);
  if (!principal) return res.status(401).json({ error: "Sign in with Clerk, wallet, or a Cheshire API key to post." });

  try {
    const room = requireRoom(req.params.roomId);
    const content = String(req.body?.content ?? "").trim().slice(0, 1500);
    if (!content) return res.status(400).json({ error: "Message content is required." });
    const identity = principalIdentity(req);
    let participant = room.participants.find((item) => item.identity === identity);
    if (!participant) {
      participant = {
        id: `p_${nanoid(10)}`,
        name: displayName(req),
        type: principal.type === "api-key" ? "agent" : "human",
        identity,
        joinedAt: nowIso(),
      };
      room.participants.push(participant);
    }
    const message: ArenaMessage = {
      id: `msg_${nanoid(10)}`,
      roomId: room.id,
      senderId: participant.id,
      senderName: participant.name,
      senderType: participant.type,
      content,
      createdAt: nowIso(),
    };
    room.messages.push(message);
    room.messages = room.messages.slice(-200);
    room.updatedAt = nowIso();
    res.status(201).json({ room: summarizeRoom(room), message });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "Failed to post message" });
  }
});

router.post("/keys", async (req, res) => {
  const principal = await resolveApiPrincipal(req);
  if (!principal) return res.status(401).json({ error: "Sign in with Clerk or wallet to create an arena API key." });
  if (!hasDatabase) return res.status(503).json({ error: "API key storage is not configured." });
  if (principal.type === "api-key") return res.status(403).json({ error: "Use a user session to create new API keys." });

  const secret = createApiKeySecret();
  const name = String(req.body?.name ?? "Agent Arena key").trim().slice(0, 128) || "Agent Arena key";
  const scopes = ["api:*", "arena:*", "route:arena:*"];
  const [created] = await db
    .insert(apiKeys)
    .values({
      userId: principal.userId ?? 0,
      name,
      keyPrefix: getApiKeyPrefix(secret),
      keyHash: hashApiKey(secret),
      scopes,
      agentWalletId: null,
      expiresAt: null,
    })
    .returning();

  res.status(201).json({
    apiKey: secret,
    key: {
      id: created.id,
      name: created.name,
      keyPrefix: created.keyPrefix,
      scopes: created.scopes,
      createdAt: created.createdAt,
      lastUsedAt: created.lastUsedAt,
    },
  });
});

export default router;
