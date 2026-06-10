import { Keypair } from "@solana/web3.js";

export interface AgentWalletManifest {
  publicKey: string;
  scope: "box-ephemeral";
  signing: "disabled-for-live" | "simulation-only";
  custody: "generated-in-sandbox" | "provided-public-reference";
  notes: string[];
}

export function createEphemeralAgentWalletManifest(): AgentWalletManifest {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();

  keypair.secretKey.fill(0);

  return {
    publicKey,
    scope: "box-ephemeral",
    signing: "simulation-only",
    custody: "generated-in-sandbox",
    notes: [
      "Generated for sandbox identity and simulation only.",
      "Secret key material is not logged, exported, or committed.",
      "Live Phoenix/Vulcan execution must use an external operator-approved signer.",
    ],
  };
}

export function publicReferenceWalletManifest(publicKey: string): AgentWalletManifest {
  return {
    publicKey,
    scope: "box-ephemeral",
    signing: "disabled-for-live",
    custody: "provided-public-reference",
    notes: [
      "Public wallet reference only.",
      "This manifest cannot sign transactions.",
      "Use it for RPC, Helius, and Phoenix trader-state reads.",
    ],
  };
}
