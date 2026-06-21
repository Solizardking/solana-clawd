/**
 * Fly 6PN Mesh — peer discovery and load balancing across US regions.
 *
 * Fly's internal DNS: <app-name>.internal  resolves to ALL running instances.
 * Each node also registers itself at startup via a gossip ping to peers.
 *
 * Routing strategy: route inference requests to the LEAST-LOADED peer that
 * responds to /health within 200ms. Fall back to self if no peers available.
 */
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { hostname } from "node:os";

const APP_NAME       = process.env.MESH_APP_NAME     ?? "clawd-inference-mesh";
const INTERNAL_PORT  = parseInt(process.env.MESH_INTERNAL_PORT ?? "8081");
const FLY_REGION     = process.env.FLY_REGION        ?? "local";
const FLY_ALLOC_ID   = process.env.FLY_ALLOC_ID      ?? hostname();

interface PeerStatus {
  alloc_id:    string;
  region:      string;
  load:        number;    // 0-1 normalized CPU/memory estimate
  models:      string[];
  last_seen:   number;
}

const peers = new Map<string, PeerStatus>();
let selfLoad = 0;

export function setSelfLoad(load: number): void {
  selfLoad = Math.max(0, Math.min(1, load));
}

/** Start the internal 6PN gossip server on MESH_INTERNAL_PORT. */
export function startMeshServer(): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/mesh/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        alloc_id: FLY_ALLOC_ID,
        region:   FLY_REGION,
        load:     selfLoad,
        models:   [
          process.env.DEFAULT_INFERENCE_MODEL ?? "8bit/solana-clawd-core-ai",
          process.env.TRADING_INFERENCE_MODEL ?? "8bit/solana-trading-factory",
        ],
        last_seen: Date.now(),
      } satisfies PeerStatus));
      return;
    }

    if (req.method === "POST" && req.url === "/mesh/gossip") {
      let body = "";
      req.on("data", (d) => { body += d; });
      req.on("end", () => {
        try {
          const peer = JSON.parse(body) as PeerStatus;
          peers.set(peer.alloc_id, { ...peer, last_seen: Date.now() });
        } catch { /* ignore malformed */ }
        res.writeHead(200).end("ok");
      });
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(INTERNAL_PORT, "0.0.0.0", () => {
    console.log(`[mesh] 6PN gossip listening on :${INTERNAL_PORT}`);
  });
}

/** Discover peers via Fly DNS and gossip our status to them. */
export async function gossipToPeers(models: string[]): Promise<void> {
  const selfStatus: PeerStatus = {
    alloc_id:  FLY_ALLOC_ID,
    region:    FLY_REGION,
    load:      selfLoad,
    models,
    last_seen: Date.now(),
  };

  // Fly internal DNS: <app-name>.internal — resolves to all instances
  const peerHost = `${APP_NAME}.internal`;

  try {
    const res = await fetch(`http://${peerHost}:${INTERNAL_PORT}/mesh/gossip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selfStatus),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) console.warn("[mesh] gossip partial failure");
  } catch {
    // No peers yet — normal at startup
  }

  // Evict stale peers (> 2 min old)
  const cutoff = Date.now() - 120_000;
  for (const [id, p] of peers) {
    if (p.last_seen < cutoff) peers.delete(id);
  }
}

/** Return the best peer to route a request to (lowest load, has model). */
export async function bestPeer(model?: string): Promise<string | null> {
  // Probe known peers in parallel
  const checks = [...peers.values()]
    .filter(p => p.alloc_id !== FLY_ALLOC_ID)
    .filter(p => !model || p.models.includes(model))
    .map(async (p) => {
      try {
        const res = await fetch(
          `http://${p.alloc_id}.vm.${APP_NAME}.internal:${INTERNAL_PORT}/mesh/status`,
          { signal: AbortSignal.timeout(200) },
        );
        if (!res.ok) return null;
        const status = await res.json() as PeerStatus;
        peers.set(status.alloc_id, { ...status, last_seen: Date.now() });
        return status;
      } catch {
        return null;
      }
    });

  const statuses = (await Promise.all(checks)).filter(Boolean) as PeerStatus[];

  if (statuses.length === 0) return null;

  // Pick lowest load
  statuses.sort((a, b) => a.load - b.load);
  const best = statuses[0];
  if (best.load > selfLoad) return null; // self is better
  return `${best.alloc_id}.vm.${APP_NAME}.internal`;
}

export function peerCount(): number {
  return peers.size;
}

export function meshInfo() {
  return {
    self:    FLY_ALLOC_ID,
    region:  FLY_REGION,
    load:    selfLoad,
    peers:   [...peers.values()].map(p => ({
      alloc_id: p.alloc_id,
      region:   p.region,
      load:     p.load,
    })),
  };
}
