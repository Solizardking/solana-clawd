#!/usr/bin/env tsx
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mintAndSubmitAgent,
  mplAgentIdentity,
} from '@metaplex-foundation/mpl-agent-registry';
import { keypairIdentity } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';

type AgentService = {
  name: string;
  endpoint: string;
  version?: string;
  description?: string;
};

type AgentRegistration = {
  name: string;
  description: string;
  image?: string;
  services?: AgentService[];
  registrations?: unknown[];
  supportedTrust?: string[];
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || args.has('--check');
const currentDir = dirname(fileURLToPath(import.meta.url));

function expandHome(path: string): string {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path);
}

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readSecretKey(): Uint8Array {
  const inline = env('SOLANA_PRIVATE_KEY');
  if (inline) {
    const parsed = JSON.parse(inline) as number[];
    if (!Array.isArray(parsed) || parsed.length < 32) {
      throw new Error('SOLANA_PRIVATE_KEY must be a JSON array of keypair bytes.');
    }
    return Uint8Array.from(parsed);
  }

  const keypairPath = expandHome(env('SOLANA_KEYPAIR_PATH', '~/.config/solana/id.json'));
  if (!existsSync(keypairPath)) {
    throw new Error(
      `No keypair found. Set SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY. Checked: ${keypairPath}`,
    );
  }

  const parsed = readJsonFile<number[]>(keypairPath);
  if (!Array.isArray(parsed) || parsed.length < 32) {
    throw new Error(`Invalid Solana keypair file: ${keypairPath}`);
  }
  return Uint8Array.from(parsed);
}

function loadRegistration(): AgentRegistration {
  const defaultPath = resolve(
    currentDir,
    '../config/solana-clawd-registration.json',
  );
  const registrationPath = resolve(env('CLAWD_REGISTRATION_FILE', defaultPath));
  return readJsonFile<AgentRegistration>(registrationPath);
}

async function main() {
  const heliusApiKey = env('HELIUS_API_KEY');
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY is required for mainnet Helius RPC.');
  }

  const registration = loadRegistration();
  const rpcUrl = env(
    'SOLANA_RPC_URL',
    `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
  );
  const metadataUri = env(
    'CLAWD_AGENT_METADATA_URI',
    'https://solanaclawd.com/agent-metadata.json',
  );

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          rpcUrl: rpcUrl.replace(heliusApiKey, '<HELIUS_API_KEY>'),
          metadataUri,
          registration,
        },
        null,
        2,
      ),
    );
    return;
  }

  const umi = createUmi(rpcUrl).use(mplAgentIdentity());
  const keypair = umi.eddsa.createKeypairFromSecretKey(readSecretKey());
  umi.use(keypairIdentity(keypair));

  const result = await mintAndSubmitAgent(
    umi,
    {},
    {
      wallet: umi.identity.publicKey,
      name: registration.name,
      uri: metadataUri,
      agentMetadata: {
        type: 'agent',
        name: registration.name,
        description: registration.description,
        image: registration.image,
        services: registration.services || [],
        registrations: registration.registrations || [],
        supportedTrust: registration.supportedTrust || [],
      },
    },
  );

  console.log('Asset address:', result.assetAddress);
  console.log('Transaction signature:', result.signature);
  console.log('View at:', `https://metaplex.com/agent/${result.assetAddress}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
