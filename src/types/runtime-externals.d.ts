declare module "@openclawdsolana/agent-registry" {
  export class AgentIndex {}
}

declare module "@clawd/solana-ai-inference-client" {
  export class SolanaAiInferenceClient {
    constructor(connection: unknown, walletOrKeypair: unknown)
  }

  export class OreMinerClient {}

  export const AI_INFERENCE_PROGRAM_ID: string
}

declare module "@openclawd/wallet" {
  export class SwapService {
    constructor(options?: unknown)
  }

  export const SOLANA_TOKENS: Record<string, unknown>
}

declare module "@openclawd/agents-x402" {
  export function createClawdX402Client(): unknown
}

declare module "@openclawdsolana/solana-sdk" {
  export const CLAWD_MINT_MAINNET: string
}

declare module "better-sqlite3" {
  export interface Statement {
    run(...params: unknown[]): unknown
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }

  export default class Database {
    constructor(filename: string)
    pragma(statement: string): unknown
    exec(sql: string): unknown
    prepare(sql: string): Statement
    close(): void
  }
}
