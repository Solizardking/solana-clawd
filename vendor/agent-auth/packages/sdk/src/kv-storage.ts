import type { AgentConnection, HostIdentity, ProviderConfig, Storage } from "./types";

/**
 * Minimal key-value store interface.
 *
 * Implement this with Redis, Vercel KV, Cloudflare KV,
 * DynamoDB, a `Map`, or anything that can store strings by key.
 *
 * ```ts
 * import Redis from "ioredis";
 * const redis = new Redis();
 * const kv: KVStore = {
 *   get: (key) => redis.get(key),
 *   set: (key, value) => redis.set(key, value, "EX", 86400).then(() => {}),
 *   del: (key) => redis.del(key).then(() => {}),
 * };
 * ```
 */
export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export interface KVStorageOptions {
  /** Key prefix to namespace all storage keys. @default "agent-auth" */
  prefix?: string;
}

/**
 * Storage adapter backed by any key-value store.
 *
 * Uses index keys to support listing without prefix scanning,
 * making it compatible with every KV backend.
 *
 * ```ts
 * import { AgentAuthClient, KVStorage } from "@auth/agent";
 * import Redis from "ioredis";
 *
 * const redis = new Redis();
 * const storage = new KVStorage({
 *   get: (key) => redis.get(key),
 *   set: (key, value) => redis.set(key, value, "EX", 86400).then(() => {}),
 *   del: (key) => redis.del(key).then(() => {}),
 * });
 *
 * const client = new AgentAuthClient({ storage });
 * ```
 */
export class KVStorage implements Storage {
  private kv: KVStore;
  private prefix: string;

  constructor(kv: KVStore, opts?: KVStorageOptions) {
    this.kv = kv;
    this.prefix = opts?.prefix ?? "agent-auth";
  }

  private k(...parts: string[]): string {
    return [this.prefix, ...parts].join(":");
  }

  private async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  private async setJSON(key: string, value: unknown): Promise<void> {
    await this.kv.set(key, JSON.stringify(value));
  }

  private async getIndex(key: string): Promise<string[]> {
    return (await this.getJSON<string[]>(key)) ?? [];
  }

  private async addToIndex(key: string, id: string): Promise<void> {
    const ids = await this.getIndex(key);
    if (!ids.includes(id)) {
      ids.push(id);
      await this.setJSON(key, ids);
    }
  }

  private async removeFromIndex(key: string, id: string): Promise<void> {
    const ids = await this.getIndex(key);
    const filtered = ids.filter((i) => i !== id);
    if (filtered.length !== ids.length) {
      await this.setJSON(key, filtered);
    }
  }

  async getHostIdentity(): Promise<HostIdentity | null> {
    return this.getJSON<HostIdentity>(this.k("host"));
  }

  async setHostIdentity(host: HostIdentity): Promise<void> {
    await this.setJSON(this.k("host"), host);
  }

  async deleteHostIdentity(): Promise<void> {
    await this.kv.del(this.k("host"));
  }

  async getAgentConnection(agentId: string): Promise<AgentConnection | null> {
    return this.getJSON<AgentConnection>(this.k("agent", agentId));
  }

  async setAgentConnection(agentId: string, conn: AgentConnection): Promise<void> {
    await this.setJSON(this.k("agent", agentId), conn);
    await this.addToIndex(this.k("agents"), agentId);
  }

  async deleteAgentConnection(agentId: string): Promise<void> {
    await this.kv.del(this.k("agent", agentId));
    await this.removeFromIndex(this.k("agents"), agentId);
  }

  async listAgentConnections(): Promise<AgentConnection[]> {
    const ids = await this.getIndex(this.k("agents"));
    const results = await Promise.all(ids.map((id) => this.getAgentConnection(id)));
    return results.filter((c): c is AgentConnection => c !== null);
  }

  async getProviderConfig(issuer: string): Promise<ProviderConfig | null> {
    return this.getJSON<ProviderConfig>(this.k("provider", encodeURIComponent(issuer)));
  }

  async setProviderConfig(issuer: string, config: ProviderConfig): Promise<void> {
    await this.setJSON(this.k("provider", encodeURIComponent(issuer)), config);
    await this.addToIndex(this.k("providers"), issuer);
  }

  async listProviderConfigs(): Promise<ProviderConfig[]> {
    const issuers = await this.getIndex(this.k("providers"));
    const results = await Promise.all(issuers.map((issuer) => this.getProviderConfig(issuer)));
    return results.filter((c): c is ProviderConfig => c !== null);
  }
}
