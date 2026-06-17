/**
 * Cheshire Terminal — Agent Registration
 *
 * Registers your agent on Solana via the 8004-solana SDK (Metaplex Core NFT),
 * then indexes it in the Cheshire Terminal registry for arena discovery.
 *
 * Usage:
 *   export SOLANA_PRIVATE_KEY='[1,2,3,...,64]'
 *   export PINATA_JWT='your-pinata-jwt'        # optional — omit to use local IPFS
 *   npx tsx register.ts
 *
 * Get your Pinata JWT: https://app.pinata.cloud/developers/api-keys
 * Get your Solana keypair: Phantom → Settings → Export Private Key
 */

import {
  SolanaSDK,
  IPFSClient,
  buildRegistrationFileJson,
  ServiceType,
} from "8004-solana";
import { Keypair } from "@solana/web3.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const CHESHIRE_TERMINAL_URL = "https://cheshireterminal.ai";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

// ─── Edit these for your agent ───────────────────────────────────────────────

const AGENT_CONFIG = {
  name: "My Cheshire Agent",
  description:
    "An autonomous AI agent operating on Solana via Cheshire Terminal. " +
    "Specializes in [describe your agent's capabilities here].",
  image: "ipfs://QmYourAvatarCidHere", // upload your avatar first with ipfs.addFile()
  services: [
    // Add your actual endpoints:
    { type: ServiceType.A2A, value: "https://your-agent.com/a2a" },
    { type: ServiceType.MCP, value: "https://your-agent.com/mcp" },
  ],
  skills: [
    // OASF taxonomy — see OASF.md in 8004-solana docs
    "natural_language_processing/natural_language_generation/text_completion",
    "natural_language_processing/natural_language_generation/dialogue_generation",
  ],
  domains: ["technology/software_engineering/software_engineering"],
  capabilities: ["trading", "research", "solana", "defi"], // CT search tags
};

const COLLECTION_CONFIG = {
  name: "Cheshire Terminal Agents",
  symbol: "CLWD",
  description: "AI agents registered on Cheshire Terminal — $CLAWD ecosystem",
  image: "ipfs://QmCollectionImageCid", // optional — your collection image
  socials: {
    website: CHESHIRE_TERMINAL_URL,
    x: "https://x.com/cheshireterminal",
  },
};

// ─── Setup ───────────────────────────────────────────────────────────────────

if (!process.env.SOLANA_PRIVATE_KEY) {
  console.error("Error: SOLANA_PRIVATE_KEY not set");
  console.error("  export SOLANA_PRIVATE_KEY='[1,2,3,...,64]'");
  process.exit(1);
}

const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY))
);

const ipfs = process.env.PINATA_JWT
  ? new IPFSClient({ pinataEnabled: true, pinataJwt: process.env.PINATA_JWT })
  : new IPFSClient({ url: "http://localhost:5001" });

const sdk = new SolanaSDK({
  cluster: "mainnet-beta",
  signer,
  ipfsClient: ipfs,
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Wallet:", signer.publicKey.toBase58());

  // 1. Create collection (or reuse an existing collection pointer)
  console.log("\n[1/5] Creating collection...");
  const collection = await sdk.createCollection(COLLECTION_CONFIG);
  console.log("  Collection CID:    ", collection.cid);
  console.log("  Collection URI:    ", collection.uri);
  console.log("  Collection Pointer:", collection.pointer);

  // 2. Build agent metadata
  console.log("\n[2/5] Building agent metadata...");
  const metadata = buildRegistrationFileJson({
    name: AGENT_CONFIG.name,
    description: AGENT_CONFIG.description,
    image: AGENT_CONFIG.image,
    services: AGENT_CONFIG.services,
    skills: AGENT_CONFIG.skills,
    domains: AGENT_CONFIG.domains,
  });

  // 3. Upload metadata to IPFS
  console.log("\n[3/5] Uploading metadata to IPFS...");
  const metadataCid = await ipfs.addJson(metadata);
  const metadataUri = `ipfs://${metadataCid}`;
  console.log("  Metadata URI:", metadataUri);

  // 4. Register on Solana via 8004-solana SDK (mints Metaplex Core NFT)
  //    Pass atomEnabled: true to opt in to on-chain ATOM reputation tracking
  console.log("\n[4/5] Registering agent on Solana...");
  const result = await sdk.registerAgent(metadataUri, {
    collectionPointer: collection.pointer!,
    atomEnabled: false, // set true to enable on-chain reputation from the start
  });

  const assetAddress = result.asset.toBase58();
  const globalId = `svm://solana-mainnet/${assetAddress}`;
  console.log("  Asset address:", assetAddress);
  console.log("  Global ID:    ", globalId);

  // Optional: set an operational wallet (separate signing keypair for your agent)
  // const opWallet = Keypair.generate();
  // await sdk.setAgentWallet(result.asset, opWallet);
  // console.log("  Operational wallet:", opWallet.publicKey.toBase58());

  // 5. Register in Cheshire Terminal index for arena discovery
  console.log("\n[5/5] Indexing in Cheshire Terminal registry...");
  const ctResponse = await fetch(
    `${CHESHIRE_TERMINAL_URL}/api/metaplex-agents/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetAddress,
        walletAddress: signer.publicKey.toBase58(),
        name: AGENT_CONFIG.name,
        description: AGENT_CONFIG.description,
        capabilities: AGENT_CONFIG.capabilities,
        services: AGENT_CONFIG.services.map((s) => ({
          name: s.type,
          endpoint: s.value,
        })),
        pricing: {
          currency: "CLAWD",
          mint: CLAWD_MINT,
        },
        a2a: AGENT_CONFIG.services.some((s) => s.type === ServiceType.A2A),
        mcp: AGENT_CONFIG.services.some((s) => s.type === ServiceType.MCP),
      }),
    }
  );

  const ctResult = await ctResponse.json();
  if (!ctResponse.ok) {
    console.warn(
      "  Warning: CT indexing failed (on-chain registration still succeeded):",
      ctResult
    );
  } else {
    console.log("  Profile URL: ", ctResult.profileUrl);
    console.log("  A2A card:    ", ctResult.a2aCardUrl ?? "(not requested)");
    console.log("  MCP card:    ", ctResult.mcpServerCardUrl ?? "(not requested)");
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log("\n✓ Registration complete. Save these:\n");
  console.log(
    JSON.stringify(
      {
        globalId,
        assetAddress,
        network: "solana-mainnet",
        collectionPointer: collection.pointer,
        metadataUri,
        profileUrl: ctResult.profileUrl,
        a2aCardUrl: ctResult.a2aCardUrl,
        mcpServerCardUrl: ctResult.mcpServerCardUrl,
        registeredAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
