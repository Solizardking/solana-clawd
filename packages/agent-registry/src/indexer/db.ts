import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";
import type { RegisteredAgent, SearchOptions, IndexStats } from "../types.js";

const CLAWD_DIR = join(homedir(), ".clawd");
const DEFAULT_DB_PATH = join(CLAWD_DIR, "agent-index.db");

export class AgentIndex {
  private db: Database.Database;

  constructor(dbPath = DEFAULT_DB_PATH) {
    mkdirSync(CLAWD_DIR, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        asset_address   TEXT PRIMARY KEY,
        owner           TEXT NOT NULL,
        name            TEXT NOT NULL,
        uri             TEXT NOT NULL,
        registration_uri TEXT,
        metadata_json   TEXT,
        network         TEXT NOT NULL DEFAULT 'solana-mainnet',
        mint_signature  TEXT,
        registered_at   INTEGER NOT NULL,
        indexed_at      INTEGER NOT NULL,
        active          INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_agents_network ON agents(network);
      CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
      CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
      CREATE INDEX IF NOT EXISTS idx_agents_indexed_at ON agents(indexed_at DESC);

      CREATE TABLE IF NOT EXISTS index_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  upsert(agent: RegisteredAgent): void {
    const stmt = this.db.prepare(`
      INSERT INTO agents (
        asset_address, owner, name, uri, registration_uri,
        metadata_json, network, mint_signature,
        registered_at, indexed_at, active
      ) VALUES (
        @assetAddress, @owner, @name, @uri, @registrationUri,
        @metadataJson, @network, @mintSignature,
        @registeredAt, @indexedAt, @active
      )
      ON CONFLICT(asset_address) DO UPDATE SET
        owner           = excluded.owner,
        name            = excluded.name,
        uri             = excluded.uri,
        registration_uri = excluded.registration_uri,
        metadata_json   = excluded.metadata_json,
        network         = excluded.network,
        mint_signature  = excluded.mint_signature,
        indexed_at      = excluded.indexed_at,
        active          = excluded.active
    `);

    stmt.run({
      assetAddress: agent.assetAddress,
      owner: agent.owner,
      name: agent.name,
      uri: agent.uri,
      registrationUri: agent.registrationUri ?? null,
      metadataJson: agent.metadata ? JSON.stringify(agent.metadata) : null,
      network: agent.network,
      mintSignature: agent.mintSignature ?? null,
      registeredAt: agent.registeredAt,
      indexedAt: Date.now(),
      active: agent.active ? 1 : 0,
    });
  }

  get(assetAddress: string): RegisteredAgent | undefined {
    const row = this.db
      .prepare("SELECT * FROM agents WHERE asset_address = ?")
      .get(assetAddress) as Record<string, unknown> | undefined;
    return row ? this.rowToAgent(row) : undefined;
  }

  search(opts: SearchOptions = {}): RegisteredAgent[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (opts.network) {
      conditions.push("network = @network");
      params.network = opts.network;
    }
    if (opts.active !== undefined) {
      conditions.push("active = @active");
      params.active = opts.active ? 1 : 0;
    }
    if (opts.query) {
      conditions.push("(name LIKE @q OR metadata_json LIKE @q)");
      params.q = `%${opts.query}%`;
    }
    if (opts.service) {
      conditions.push("metadata_json LIKE @service");
      params.service = `%"name":"${opts.service}"%`;
    }
    if (opts.capability) {
      conditions.push("metadata_json LIKE @cap");
      params.cap = `%${opts.capability}%`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const rows = this.db
      .prepare(
        `SELECT * FROM agents ${where} ORDER BY indexed_at DESC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset }) as Record<string, unknown>[];

    return rows.map(this.rowToAgent);
  }

  stats(): IndexStats {
    const total = (
      this.db.prepare("SELECT COUNT(*) as n FROM agents").get() as { n: number }
    ).n;
    const active = (
      this.db
        .prepare("SELECT COUNT(*) as n FROM agents WHERE active = 1")
        .get() as { n: number }
    ).n;
    const byNetworkRows = this.db
      .prepare("SELECT network, COUNT(*) as n FROM agents GROUP BY network")
      .all() as { network: string; n: number }[];

    const byNetwork: Record<string, number> = {};
    for (const r of byNetworkRows) byNetwork[r.network] = r.n;

    const lastRow = this.db
      .prepare(
        "SELECT value FROM index_meta WHERE key = 'last_indexed'"
      )
      .get() as { value: string } | undefined;

    return {
      total,
      active,
      byNetwork,
      lastIndexed: lastRow ? parseInt(lastRow.value, 10) : 0,
    };
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO index_meta (key, value) VALUES (?, ?)"
      )
      .run(key, value);
  }

  close(): void {
    this.db.close();
  }

  private rowToAgent(row: Record<string, unknown>): RegisteredAgent {
    return {
      assetAddress: row.asset_address as string,
      owner: row.owner as string,
      name: row.name as string,
      uri: row.uri as string,
      registrationUri: row.registration_uri as string | undefined,
      metadata: row.metadata_json
        ? JSON.parse(row.metadata_json as string)
        : undefined,
      network: (row.network as string) as RegisteredAgent["network"],
      mintSignature: row.mint_signature as string | undefined,
      registeredAt: row.registered_at as number,
      indexedAt: row.indexed_at as number,
      active: (row.active as number) === 1,
    };
  }
}
