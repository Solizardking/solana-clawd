import { registerIdentityV1 } from "@metaplex-foundation/mpl-agent-registry";
import type { PublicKey, Umi } from "@metaplex-foundation/umi";
import { publicKey } from "@metaplex-foundation/umi";
import { createSvmA2AUmi } from "./mint.js";

export interface RegisterAgentIdentityInput {
  agentId: string;
  endpoint: string;
  did?: string;
  asset?: string | PublicKey;
  registrationUri?: string;
  live?: boolean;
  umi?: Umi;
}

export async function registerAgentIdentity(input: RegisterAgentIdentityInput) {
  const registrationUri = input.registrationUri ?? input.did ?? `${input.endpoint}/.well-known/agent-card.json`;

  if (!input.live) {
    return {
      status: "dry-run",
      ...input,
      registrationUri,
      note: "Pass live: true with an asset address and configured Umi signer to send registerIdentityV1."
    };
  }

  if (!input.asset) {
    throw new Error("registerAgentIdentity live mode requires an MPL Core asset address.");
  }

  const umi = input.umi ?? createSvmA2AUmi();
  const result = await registerIdentityV1(umi, {
    asset: typeof input.asset === "string" ? publicKey(input.asset) : input.asset,
    agentRegistrationUri: registrationUri
  }).sendAndConfirm(umi);

  return {
    status: "registered",
    ...input,
    registrationUri,
    signature: Buffer.from(result.signature).toString("base64")
  };
}
