import { Client, Receiver } from "@upstash/qstash";
import type { Request } from "express";

const hasToken = Boolean(process.env.QSTASH_TOKEN);
const hasSigningKeys = Boolean(
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY,
);

if (!hasToken) {
  console.error("[qstash] WARNING: QSTASH_TOKEN not set");
}

export const qstashConfigured = hasToken;
export const qstashReceiverConfigured = hasSigningKeys;

export const qstash = new Client({
  token: process.env.QSTASH_TOKEN ?? "",
  ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
});

export const qstashReceiver = hasSigningKeys
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    })
  : null;

export async function verifyQstashRequest(req: Request) {
  if (!qstashReceiver) return false;
  const signature = req.header("upstash-signature") ?? req.header("Upstash-Signature");
  const rawBody = typeof (req as any).rawBody === "string"
    ? (req as any).rawBody
    : JSON.stringify(req.body ?? {});

  if (!signature) return false;

  try {
    return await qstashReceiver.verify({
      signature,
      body: rawBody,
    });
  } catch (error: any) {
    console.warn("[qstash] verify failed:", error?.message || error);
    return false;
  }
}
