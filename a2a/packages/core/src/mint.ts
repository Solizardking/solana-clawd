import { mplAgentIdentity, mintAndSubmitAgent } from "@metaplex-foundation/mpl-agent-registry";
import type { AgentMetadata, SvmNetwork } from "@metaplex-foundation/mpl-agent-registry";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, type Umi } from "@metaplex-foundation/umi";

export interface MintAgentCardInput {
  name: string;
  uri: string;
  description?: string;
  endpoint?: string;
  network?: SvmNetwork;
  owner?: string;
  live?: boolean;
  umi?: Umi;
}

export interface MintAgentCardResult {
  status: "dry-run" | "minted";
  name: string;
  uri: string;
  owner?: string;
  network: SvmNetwork;
  assetAddress?: string;
  signature?: string;
  agentMetadata: AgentMetadata;
  note?: string;
}

const DEFAULT_NETWORK: SvmNetwork = "solana-devnet";

function rpcUrlForNetwork(network: SvmNetwork) {
  if (network === "solana-devnet") {
    return process.env.HELIUS_DEVNET_URL ?? process.env.SOLANA_DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
  }

  if (network === "solana-mainnet") {
    return process.env.HELIUS_RPC_URL ??
      (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : undefined) ??
      process.env.SOLANA_RPC_URL ??
      "https://api.mainnet-beta.solana.com";
  }

  return process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
}

function secretKeyFromEnv() {
  const raw = process.env.SOLANA_SECRET_KEY ?? process.env.SOLANA_PRIVATE_KEY ?? process.env.WALLET_PRIVATE_KEY;
  if (!raw) return undefined;
  if (!raw.trim().startsWith("[")) {
    throw new Error("SVM-A2A live mint expects SOLANA_SECRET_KEY/SOLANA_PRIVATE_KEY as a JSON byte array.");
  }
  return Uint8Array.from(JSON.parse(raw) as number[]);
}

function hasSecretKeyEnv() {
  return Boolean(process.env.SOLANA_SECRET_KEY ?? process.env.SOLANA_PRIVATE_KEY ?? process.env.WALLET_PRIVATE_KEY);
}

export function createSvmA2AUmi(network: SvmNetwork = DEFAULT_NETWORK, secretKey = secretKeyFromEnv()) {
  const umi = createUmi(rpcUrlForNetwork(network)).use(mplAgentIdentity());
  if (secretKey) {
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
    umi.use(keypairIdentity(keypair));
  }
  return umi;
}

export function buildSvmA2AAgentMetadata(input: MintAgentCardInput): AgentMetadata {
  const endpoint = input.endpoint ?? "https://api.svm-a2a.ai";
  return {
    type: "agent",
    name: input.name,
    description: input.description ?? "Production Solana SVM-A2A agent with Metaplex Core identity and Clawd trust gates.",
    services: [
      { name: "a2a", endpoint },
      { name: "discovery", endpoint: `${endpoint}/.well-known/agent-card.json` },
      { name: "tasks", endpoint: `${endpoint}/tasks` }
    ],
    registrations: [
      {
        agentId: "svm-a2a-production-agent",
        agentRegistry: "metaplex-agent-registry"
      }
    ],
    supportedTrust: ["SIWS", "NFT-Ownership", "CLAWD-Tier", "SAS-Attestation"]
  };
}

export async function mintAgentCard(input: MintAgentCardInput): Promise<MintAgentCardResult> {
  const network = input.network ?? DEFAULT_NETWORK;
  const agentMetadata = buildSvmA2AAgentMetadata(input);

  if (!input.live) {
    const owner = input.owner ?? input.umi?.identity.publicKey.toString();
    return {
      status: "dry-run",
      name: input.name,
      uri: input.uri,
      owner,
      network,
      agentMetadata,
      note: "Pass --live with SOLANA_SECRET_KEY as a JSON byte array to mint through the Metaplex Agent API."
    };
  }

  if (!input.umi && !hasSecretKeyEnv()) {
    throw new Error("SVM-A2A live mint requires SOLANA_SECRET_KEY, SOLANA_PRIVATE_KEY, or WALLET_PRIVATE_KEY as a JSON byte array.");
  }

  const umi = input.umi ?? createSvmA2AUmi(network);
  const owner = input.owner ?? umi.identity.publicKey.toString();
  const result = await mintAndSubmitAgent(umi, {}, {
    wallet: owner,
    network,
    name: input.name,
    uri: input.uri,
    agentMetadata
  });

  return {
    status: "minted",
    name: input.name,
    uri: input.uri,
    owner,
    network,
    assetAddress: result.assetAddress,
    signature: Buffer.from(result.signature).toString("base64"),
    agentMetadata
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const live = process.argv.includes("--live");
  const networkArg = process.argv.find((arg) => arg.startsWith("--network="));
  const endpointArg = process.argv.find((arg) => arg.startsWith("--endpoint="));
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const name = args[0] ?? "SVM-A2A Production Agent";
  const uri = args[1] ?? "https://api.svm-a2a.ai/.well-known/agent-card.json";
  const network = (networkArg?.split("=")[1] as SvmNetwork | undefined) ?? DEFAULT_NETWORK;
  const endpoint = endpointArg?.split("=")[1] ?? "https://api.svm-a2a.ai";
  console.log(JSON.stringify(await mintAgentCard({ name, uri, endpoint, network, live }), null, 2));
}
