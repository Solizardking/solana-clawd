import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import {
  mplAgentIdentity,
  mintAndSubmitAgent,
  safeFetchAgentIdentityV1,
  findAgentIdentityV1Pda,
  registerIdentityV1,
} from "@metaplex-foundation/mpl-agent-registry";
import { fetchAsset } from "@metaplex-foundation/mpl-core";
import type {
  AgentMetadata,
  AgentNetwork,
  MintAgentOptions,
  RegisterAgentOptions,
  RegisteredAgent,
} from "../types.js";

const RPC_BY_NETWORK: Record<AgentNetwork, string> = {
  "solana-mainnet": "https://api.mainnet-beta.solana.com",
  "solana-devnet": "https://api.devnet.solana.com",
  localnet: "http://localhost:8899",
  "eclipse-mainnet": "https://mainnetbeta-rpc.eclipse.xyz",
  "sonic-mainnet": "https://api.mainnet.sonic.game",
  "sonic-devnet": "https://api.devnet.sonic.game",
  "fogo-mainnet": "https://rpc.mainnet.fogo.io",
  "fogo-testnet": "https://rpc.testnet.fogo.io",
};

function buildUmi(secretKey: Uint8Array, rpcUrl: string) {
  const umi = createUmi(rpcUrl).use(mplAgentIdentity());
  const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  umi.use(keypairIdentity(keypair));
  return umi;
}

export async function mintAgent(opts: MintAgentOptions): Promise<{
  assetAddress: string;
  signature: string;
}> {
  const network = opts.network ?? "solana-mainnet";
  const rpcUrl = opts.rpcUrl ?? RPC_BY_NETWORK[network];
  const umi = buildUmi(opts.secretKey, rpcUrl);

  const result = await mintAndSubmitAgent(
    umi,
    opts.baseUrl ? { baseUrl: opts.baseUrl } : {},
    {
      wallet: umi.identity.publicKey,
      network,
      name: opts.name,
      uri: opts.uri,
      agentMetadata: {
        ...opts.metadata,
        services: opts.metadata.services ?? [],
        registrations: opts.metadata.registrations ?? [],
        supportedTrust: opts.metadata.supportedTrust ?? [],
      },
    }
  );

  return {
    assetAddress: result.assetAddress.toString(),
    signature: Buffer.from(result.signature).toString("base64"),
  };
}

export async function registerAgent(
  opts: RegisterAgentOptions
): Promise<void> {
  const rpcUrl = opts.rpcUrl ?? "https://api.mainnet-beta.solana.com";
  const umi = buildUmi(opts.secretKey, rpcUrl);

  const assetPk = publicKey(opts.assetAddress);
  await registerIdentityV1(umi, {
    asset: assetPk,
    ...(opts.collectionAddress
      ? { collection: publicKey(opts.collectionAddress) }
      : {}),
    agentRegistrationUri: opts.registrationUri,
  }).sendAndConfirm(umi);
}

export async function fetchAgent(
  assetAddress: string,
  rpcUrl = "https://api.mainnet-beta.solana.com"
): Promise<RegisteredAgent | null> {
  const umi = createUmi(rpcUrl).use(mplAgentIdentity());
  const assetPk = publicKey(assetAddress);

  const pda = findAgentIdentityV1Pda(umi, { asset: assetPk });
  const identity = await safeFetchAgentIdentityV1(umi, pda);
  if (!identity) return null;

  const asset = await fetchAsset(umi, assetPk);
  const agentIdentity = asset.agentIdentities?.[0];

  let metadata: AgentMetadata | undefined;
  if (agentIdentity?.uri) {
    try {
      const res = await fetch(agentIdentity.uri);
      metadata = await res.json() as AgentMetadata;
    } catch {
      // metadata fetch is best-effort
    }
  }

  return {
    assetAddress,
    owner: asset.owner.toString(),
    name: asset.name,
    uri: asset.uri,
    registrationUri: agentIdentity?.uri,
    metadata,
    network: "solana-mainnet",
    registeredAt: Date.now(),
    indexedAt: Date.now(),
    active: metadata?.active !== false,
  };
}

export async function verifyRegistration(
  assetAddress: string,
  rpcUrl = "https://api.mainnet-beta.solana.com"
): Promise<{
  registered: boolean;
  transferHook: boolean;
  updateHook: boolean;
  executeHook: boolean;
}> {
  const umi = createUmi(rpcUrl).use(mplAgentIdentity());
  const assetPk = publicKey(assetAddress);
  const asset = await fetchAsset(umi, assetPk);
  const id = asset.agentIdentities?.[0];

  return {
    registered: !!id,
    transferHook: !!id?.lifecycleChecks?.transfer,
    updateHook: !!id?.lifecycleChecks?.update,
    executeHook: !!id?.lifecycleChecks?.execute,
  };
}
