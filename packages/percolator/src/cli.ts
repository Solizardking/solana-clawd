/**
 * Percolator CLI
 * 
 * 🧪 CLI for Percolator perpetuals protocol
 * 
 * @module cli
 */

import { Command } from "commander";

export interface GlobalFlags {
  cluster: string;
  commitment: string;
  simulate: boolean;
  json: boolean;
  keypair: string;
  verbose: boolean;
  programId: string;
  rpcUrl: string;
}

export function getGlobalFlags(cmd: Command): GlobalFlags {
  return {
    cluster: cmd.opts().cluster ?? process.env.CLUSTER ?? "mainnet-beta",
    commitment: cmd.opts().commitment ?? "confirmed",
    simulate: cmd.opts().simulate ?? false,
    json: cmd.opts().json ?? false,
    keypair: cmd.opts().keypair ?? process.env.KEYPAIR ?? "~/.config/solana/id.json",
    verbose: cmd.opts().verbose ?? false,
    programId: cmd.opts().programId ?? process.env.PROGRAM_ID ?? "PERC8m2tkHwVBEZSCz3E5JhcUVE5sWsEG8q39h7mSS5M",
    rpcUrl: cmd.opts().rpcUrl ?? process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
  };
}

export function createProgram(): Command {
  const program = new Command();
  
  program
    .name("percolator")
    .description("🧪 Percolator perpetuals CLI\n\nTrade, manage, and monitor perpetuals markets on Solana")
    .version("1.0.0")
    .option("-c, --cluster <cluster>", "Solana cluster", "mainnet-beta")
    .option("--commitment <commitment>", "Transaction commitment level", "confirmed")
    .option("--simulate", "Simulate transactions", false)
    .option("--json", "Output JSON format", false)
    .option("-k, --keypair <path>", "Keypair path", process.env.KEYPAIR ?? "~/.config/solana/id.json")
    .option("-v, --verbose", "Verbose output", false)
    .option("--program-id <pubkey>", "Program ID", process.env.PROGRAM_ID ?? "PERC8m2tkHwVBEZSCz3E5JhcUVE5sWsEG8q39h7mSS5M")
    .option("--rpc-url <url>", "RPC URL", process.env.RPC_URL);

  return program;
}
