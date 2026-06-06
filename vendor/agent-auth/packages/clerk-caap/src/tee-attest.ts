// Phala dstack TEE attestation for CAAP — follows the phaal pattern from
// src/lib/redpill/tee.ts. Fetches an Intel TDX quote from the dstack tappd
// socket, bundles it with the CAAP attestation hash, and returns a
// structured result that maps to proof.t16z.com explorer format.

import { createHash, randomBytes } from "node:crypto";

const TAPPD_ENDPOINT =
  process.env.DSTACK_SIMULATOR_ENDPOINT ??
  process.env.TAPPD_ENDPOINT ??
  "http://localhost:8090";

export interface PhalaAttestationResult {
  // dstack / Phala dstack fields (mirrors TeeAttestationSummary from tee.ts)
  appId: string | null;
  instanceId: string | null;
  composeHash: string | null;
  mrAggregated: string | null;
  osImageHash: string | null;
  mrtd: string | null;
  rtmr0: string | null;
  rtmr1: string | null;
  rtmr2: string | null;
  rtmr3: string | null;
  appCert: string | null;
  intelQuote: string | null;
  explorerUrl: string | null;
  // CAAP-specific
  caapHash: string;
  nonce: string;
  fetchedAt: string;
  hasTeeEvidence: boolean;
  error?: string;
}

type TappdDeriveKeyResponse = {
  key: string;
  certificate_chain: string[];
};

type TappdTdxQuoteResponse = {
  quote: string;
  event_log: string;
};

type TappdInfoResponse = {
  app_id: string;
  instance_id: string;
  compose_hash: string;
  tcb_info: {
    mr_aggregated?: string;
    os_image_hash?: string;
    mrtd?: string;
    rtmr0?: string;
    rtmr1?: string;
    rtmr2?: string;
    rtmr3?: string;
  };
  app_cert?: string;
};

async function tappdPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${TAPPD_ENDPOINT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`tappd ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function tappdGet<T>(path: string): Promise<T> {
  const res = await fetch(`${TAPPD_ENDPOINT}${path}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`tappd GET ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Fetch a Phala dstack TDX attestation quote for a CAAP attestation hash.
 * The report_data embeds the caapHash so the quote is cryptographically
 * bound to the specific agent attestation being proven.
 */
export async function fetchPhalaAttestation(
  caapHash: string,
): Promise<PhalaAttestationResult> {
  const nonce = randomBytes(16).toString("hex");
  // report_data: first 32 bytes = caapHash, next 16 = nonce
  const reportData = caapHash.slice(0, 64) + nonce;

  try {
    const [infoResult, quoteResult] = await Promise.allSettled([
      tappdGet<TappdInfoResponse>("/prpc/Tappd.TdxQuote"),
      tappdPost<TappdTdxQuoteResponse>("/prpc/Tappd.TdxQuote", {
        report_data: reportData,
      }),
    ]);

    // Separately fetch instance info for the structured fields
    let info: TappdInfoResponse | null = null;
    try {
      info = await tappdGet<TappdInfoResponse>("/prpc/Tappd.GetInfo");
    } catch {
      // non-fatal; fields will be null
    }

    const quote =
      quoteResult.status === "fulfilled" ? quoteResult.value.quote : null;

    const tcb = info?.tcb_info ?? {};
    const appCert = info?.app_cert ?? null;
    const signingAddress = appCert
      ? deriveSigningAddress(appCert)
      : null;

    return {
      appId: info?.app_id ?? null,
      instanceId: info?.instance_id ?? null,
      composeHash: info?.compose_hash ?? null,
      mrAggregated: tcb.mr_aggregated ?? null,
      osImageHash: tcb.os_image_hash ?? null,
      mrtd: tcb.mrtd ?? null,
      rtmr0: tcb.rtmr0 ?? null,
      rtmr1: tcb.rtmr1 ?? null,
      rtmr2: tcb.rtmr2 ?? null,
      rtmr3: tcb.rtmr3 ?? null,
      appCert,
      intelQuote: quote,
      explorerUrl: signingAddress
        ? `https://proof.t16z.com/?attestation=${encodeURIComponent(signingAddress)}`
        : null,
      caapHash,
      nonce,
      fetchedAt: new Date().toISOString(),
      hasTeeEvidence: Boolean(quote),
    };
  } catch (err) {
    return {
      appId: null,
      instanceId: null,
      composeHash: null,
      mrAggregated: null,
      osImageHash: null,
      mrtd: null,
      rtmr0: null,
      rtmr1: null,
      rtmr2: null,
      rtmr3: null,
      appCert: null,
      intelQuote: null,
      explorerUrl: null,
      caapHash,
      nonce,
      fetchedAt: new Date().toISOString(),
      hasTeeEvidence: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Derive a deterministic signing address from the app cert for the explorer URL */
function deriveSigningAddress(appCert: string): string {
  return createHash("sha256").update(appCert).digest("hex").slice(0, 40);
}

/** Derive a secp256k1-style key inside the TEE for CAAP signing */
export async function deriveRelayKey(subject: string): Promise<{ key: string; cert: string }> {
  const res = await tappdPost<TappdDeriveKeyResponse>("/prpc/Tappd.DeriveKey", {
    path: `/caap/relay/${subject}`,
    subject,
  });
  return { key: res.key, certificate_chain: res.certificate_chain } as unknown as { key: string; cert: string };
}
