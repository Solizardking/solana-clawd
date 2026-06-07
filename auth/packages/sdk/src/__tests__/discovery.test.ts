import { describe, it, expect, beforeAll } from "vitest";
import { getTestInstance } from "better-auth/test";
import { agentAuth } from "@better-auth/agent-auth";
import { discoverProvider } from "../discovery";
import { AgentAuthSDKError } from "../types";

// `better-auth/test` mounts the handler at this origin by default.
const BASE = "http://localhost:3000";

// Build a fetch implementation that routes requests at `BASE` through the
// in-process better-auth handler. Anything else 404s so we can observe the
// SDK's URL probing without hitting the real network.
function makeRoutedFetch(handler: (req: Request) => Promise<Response>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input as string, init);
    if (req.url.startsWith(BASE)) {
      return handler(req);
    }
    return new Response("not found", { status: 404 });
  };
}

describe("discoverProvider — routes against Better Auth default mount", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let auth: any;

  beforeAll(async () => {
    const t = await getTestInstance({
      // Default basePath ("/api/auth") + default plugin config — this is the
      // exact shape every getting-started example produces.
      plugins: [agentAuth()],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auth = t.auth as any;
    fetchFn = makeRoutedFetch((req) => auth.handler(req));
  });

  it("resolves a valid ProviderConfig against the default basePath", async () => {
    // Regression for the 0.5.1 bug: the SDK was probing
    // `/api/auth/agent/agent-configuration`, but the plugin mounts
    // `/agent-configuration` directly under the basePath, so the real path is
    // `/api/auth/agent-configuration`.
    const config = await discoverProvider(BASE, fetchFn as typeof globalThis.fetch);

    expect(config.version).toBe("1.0-draft");
    expect(config.issuer).toBeTruthy();
    expect(config.endpoints).toBeTruthy();
    expect(config.endpoints.execute).toContain("/capability/execute");
    expect(config.endpoints.register).toContain("/agent/register");
  });

  it("the SDK's first attempted URL after .well-known is the real plugin path", async () => {
    const attempted: string[] = [];
    const recordingFetch: typeof globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      attempted.push(url);
      // Surface the actual handler response so the SDK still parses a
      // valid config and resolves successfully.
      return fetchFn(input as RequestInfo | URL, init);
    };

    await discoverProvider(BASE, recordingFetch);

    expect(attempted[0]).toBe(`${BASE}/.well-known/agent-configuration`);
    expect(attempted[1]).toBe(`${BASE}/api/auth/agent-configuration`);
  });

  it("throws AgentAuthSDKError('discovery_failed') when no endpoint responds", async () => {
    const dropAll: typeof globalThis.fetch = async () => new Response("not found", { status: 404 });

    await expect(discoverProvider(BASE, dropAll)).rejects.toBeInstanceOf(AgentAuthSDKError);
    await expect(discoverProvider(BASE, dropAll)).rejects.toMatchObject({
      code: "discovery_failed",
    });
  });
});
