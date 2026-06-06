import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import {
  agentAuth,
  agentAuthClientPlugin,
  createAgentJWT,
  createHostJWT,
  createTestClient,
  expectError,
  generateTestKeypair,
  json,
} from "./helpers";
import type { AgentAuthEvent, AgentJWK } from "../types";

const TEST_CAPABILITIES = [
  {
    name: "check_balance",
    description: "Check account balance",
  },
  {
    name: "transfer",
    description: "Transfer money",
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let auth: any;
let client: ReturnType<typeof createTestClient>;
let sessionCookie: string;
const events: AgentAuthEvent[] = [];

beforeAll(async () => {
  const t = await getTestInstance(
    {
      plugins: [
        agentAuth({
          providerName: "test-service",
          modes: ["delegated", "autonomous"],
          capabilities: TEST_CAPABILITIES,
          defaultHostCapabilities: ["check_balance", "transfer"],
          onExecute: async ({ capability }) => ({ ok: true, capability }),
          onEvent: (event) => {
            events.push(event);
          },
        }),
      ],
    },
    {
      clientOptions: { plugins: [agentAuthClientPlugin()] },
    },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth = t.auth;
  client = createTestClient((req) => auth.handler(req));

  const { headers } = await t.signInWithTestUser();
  sessionCookie = headers.get("cookie") ?? "";
});

interface AgentFixture {
  agentId: string;
  hostId: string;
  agentKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
  hostKeypair: { publicKey: AgentJWK; privateKey: AgentJWK };
}

async function createDelegatedAgent(opts?: { capabilities?: string[] }): Promise<AgentFixture> {
  const hostKeypair = await generateTestKeypair();
  const hostRes = await client.authedPost(
    "/host/create",
    {
      name: "Revoke-Cap Host",
      public_key: hostKeypair.publicKey,
      default_capabilities: opts?.capabilities ?? ["check_balance", "transfer"],
    },
    sessionCookie,
  );
  const { hostId } = await json<{ hostId: string }>(hostRes);

  const agentKeypair = await generateTestKeypair();
  const hostJWT = await createHostJWT(
    hostKeypair.privateKey,
    hostKeypair.publicKey,
    agentKeypair.publicKey,
    hostId,
  );
  const regRes = await client.api("/agent/register", {
    method: "POST",
    headers: { authorization: `Bearer ${hostJWT}` },
    body: JSON.stringify({
      name: "Revoke-Cap Agent",
      capabilities: opts?.capabilities ?? ["check_balance", "transfer"],
      mode: "delegated",
    }),
  });
  const regBody = await json<{ agent_id?: string; error?: string; message?: string }>(regRes);
  if (!regBody.agent_id) {
    throw new Error(`Agent registration failed: ${JSON.stringify(regBody)}`);
  }
  return { agentId: regBody.agent_id, hostId, agentKeypair, hostKeypair };
}

describe("POST /agent/revoke-capability", () => {
  let fixture: AgentFixture;

  beforeEach(async () => {
    fixture = await createDelegatedAgent();
    events.length = 0;
  });

  it("revokes a single capability via user session and leaves the agent intact", async () => {
    const res = await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["transfer"] },
      sessionCookie,
    );
    expect(res.ok).toBe(true);
    const body = await json<{
      agent_id: string;
      revoked: string[];
      grant_ids: string[];
    }>(res);
    expect(body.agent_id).toBe(fixture.agentId);
    expect(body.revoked).toEqual(["transfer"]);
    expect(body.grant_ids.length).toBeGreaterThan(0);

    // The other grant must remain active — executing it still works.
    const agentJWT = await createAgentJWT(fixture.agentKeypair.privateKey, fixture.agentId, {
      capabilities: ["check_balance"],
    });
    const execOk = await client.api("/capability/execute", {
      method: "POST",
      headers: { authorization: `Bearer ${agentJWT}` },
      body: JSON.stringify({ capability: "check_balance" }),
    });
    expect(execOk.ok).toBe(true);
  });

  it("executing a revoked capability surfaces grant_revoked (not capability_not_granted)", async () => {
    await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["transfer"] },
      sessionCookie,
    );

    const agentJWT = await createAgentJWT(fixture.agentKeypair.privateKey, fixture.agentId, {
      capabilities: ["transfer"],
    });
    const res = await client.api("/capability/execute", {
      method: "POST",
      headers: { authorization: `Bearer ${agentJWT}` },
      body: JSON.stringify({ capability: "transfer" }),
    });
    await expectError(res, "grant_revoked", 403);
  });

  it("executing a capability that was never granted still surfaces capability_not_granted", async () => {
    // Fresh agent with only "check_balance" — "transfer" was never granted.
    const restricted = await createDelegatedAgent({ capabilities: ["check_balance"] });
    const agentJWT = await createAgentJWT(restricted.agentKeypair.privateKey, restricted.agentId, {
      capabilities: ["transfer"],
    });
    const res = await client.api("/capability/execute", {
      method: "POST",
      headers: { authorization: `Bearer ${agentJWT}` },
      body: JSON.stringify({ capability: "transfer" }),
    });
    // Either capability_not_granted (no auto-grant) or grant_revoked is wrong
    // — confirm it's specifically the "never granted" path.
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("capability_not_granted");
  });

  it("is idempotent — re-revoking the same capability is a no-op", async () => {
    await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["transfer"] },
      sessionCookie,
    );
    const res = await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["transfer"] },
      sessionCookie,
    );
    expect(res.ok).toBe(true);
    const body = await json<{ revoked: string[]; grant_ids: string[] }>(res);
    expect(body.revoked).toEqual([]);
    expect(body.grant_ids).toEqual([]);
  });

  it("allows the agent to self-revoke via its own JWT", async () => {
    const agentJWT = await createAgentJWT(fixture.agentKeypair.privateKey, fixture.agentId);
    const res = await client.api("/agent/revoke-capability", {
      method: "POST",
      headers: { authorization: `Bearer ${agentJWT}` },
      body: JSON.stringify({
        agent_id: fixture.agentId,
        capabilities: ["check_balance"],
      }),
    });
    expect(res.ok).toBe(true);
    const body = await json<{ revoked: string[] }>(res);
    expect(body.revoked).toEqual(["check_balance"]);
  });

  it("rejects an agent JWT trying to revoke another agent's capability", async () => {
    const other = await createDelegatedAgent();
    const otherJWT = await createAgentJWT(other.agentKeypair.privateKey, other.agentId);
    const res = await client.api("/agent/revoke-capability", {
      method: "POST",
      headers: { authorization: `Bearer ${otherJWT}` },
      body: JSON.stringify({
        agent_id: fixture.agentId, // belongs to a different agent
        capabilities: ["check_balance"],
      }),
    });
    await expectError(res, "unauthorized", 403);
  });

  it("allows the host to revoke capabilities on an agent it owns via host JWT", async () => {
    // Host JWTs require both agent and host public keys in the body.
    // For a "the host revokes from one of its existing agents" call, the
    // simplest route is to mint a fresh keypair so the JWT is well-formed.
    const dummyAgentKeypair = await generateTestKeypair();
    const hostJWT = await createHostJWT(
      fixture.hostKeypair.privateKey,
      fixture.hostKeypair.publicKey,
      dummyAgentKeypair.publicKey,
      fixture.hostId,
    );
    const res = await client.api("/agent/revoke-capability", {
      method: "POST",
      headers: { authorization: `Bearer ${hostJWT}` },
      body: JSON.stringify({
        agent_id: fixture.agentId,
        capabilities: ["transfer"],
      }),
    });
    expect(res.ok).toBe(true);
    const body = await json<{ revoked: string[] }>(res);
    expect(body.revoked).toEqual(["transfer"]);
  });

  it("rejects a host JWT trying to revoke an agent on a different host", async () => {
    const other = await createDelegatedAgent();
    const dummyAgentKeypair = await generateTestKeypair();
    const otherHostJWT = await createHostJWT(
      other.hostKeypair.privateKey,
      other.hostKeypair.publicKey,
      dummyAgentKeypair.publicKey,
      other.hostId,
    );
    const res = await client.api("/agent/revoke-capability", {
      method: "POST",
      headers: { authorization: `Bearer ${otherHostJWT}` },
      body: JSON.stringify({
        agent_id: fixture.agentId, // attached to a different host
        capabilities: ["transfer"],
      }),
    });
    await expectError(res, "unauthorized", 403);
  });

  it("emits a capability.revoked audit event with the affected capabilities", async () => {
    await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["transfer"] },
      sessionCookie,
    );
    const event = events.find((e) => e.type === "capability.revoked");
    expect(event).toBeDefined();
    expect(event!.agentId).toBe(fixture.agentId);
    expect(event!.metadata?.capabilities).toEqual(["transfer"]);
    expect(Array.isArray(event!.metadata?.grantIds)).toBe(true);
    expect((event!.metadata!.grantIds as string[]).length).toBeGreaterThan(0);
  });

  it("does not emit capability.revoked when the call is a no-op", async () => {
    // First revoke flips the grant. Clear the buffer afterwards.
    await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["transfer"] },
      sessionCookie,
    );
    events.length = 0;

    await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["transfer"] },
      sessionCookie,
    );
    expect(events.find((e) => e.type === "capability.revoked")).toBeUndefined();
  });

  it("requires authentication", async () => {
    const res = await client.api("/agent/revoke-capability", {
      method: "POST",
      body: JSON.stringify({
        agent_id: fixture.agentId,
        capabilities: ["check_balance"],
      }),
    });
    await expectError(res, "unauthorized");
  });

  it("404s on an unknown agent", async () => {
    const res = await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: "agent_does_not_exist", capabilities: ["transfer"] },
      sessionCookie,
    );
    await expectError(res, "agent_not_found", 404);
  });

  it("rejects revoke-capability on an already-revoked agent with AGENT_REVOKED", async () => {
    // Whole-agent revoke cascades grants to "revoked" and flips the agent
    // status. A follow-up per-capability revoke is meaningless and should
    // surface the agent state explicitly — symmetric with grant-capability.
    await client.authedPost("/agent/revoke", { agent_id: fixture.agentId }, sessionCookie);

    const res = await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["check_balance"] },
      sessionCookie,
    );
    await expectError(res, "agent_revoked", 403);
  });

  it("revokes every grant for a capability when multiple exist under different constraint scopes", async () => {
    // Seed a second grant for "check_balance" under a different constraint
    // scope by writing through the adapter directly — the high-level routes
    // dedupe by capability, so this is the cleanest way to set up the
    // multi-grant state the route comment promises to handle.
    const context = await auth.$context;
    const now = new Date();
    const extra = await context.adapter.create({
      model: "agentCapabilityGrant",
      data: {
        agentId: fixture.agentId,
        capability: "check_balance",
        constraints: JSON.stringify({ account_id: "acct_other" }),
        grantedBy: null,
        deniedBy: null,
        expiresAt: null,
        status: "active",
        reason: "seeded_for_multi_grant_test",
        createdAt: now,
        updatedAt: now,
      },
    });

    const res = await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["check_balance"] },
      sessionCookie,
    );
    expect(res.ok).toBe(true);
    const body = await json<{ revoked: string[]; grant_ids: string[] }>(res);
    expect(body.revoked).toEqual(["check_balance"]);
    // Both the auto-granted grant from host budget and the seeded scoped
    // grant must be in the returned grant_ids — the route flips every
    // matching row, not just the first one.
    expect(body.grant_ids.length).toBeGreaterThanOrEqual(2);
    expect(body.grant_ids).toContain((extra as { id: string }).id);

    // Every remaining grant for this (agent, capability) pair must be revoked.
    const remaining = await context.adapter.findMany({
      model: "agentCapabilityGrant",
      where: [
        { field: "agentId", value: fixture.agentId },
        { field: "capability", value: "check_balance" },
      ],
    });
    expect(remaining.length).toBeGreaterThanOrEqual(2);
    for (const g of remaining as Array<{ status: string }>) {
      expect(g.status).toBe("revoked");
    }
  });

  it("does not silently re-auto-grant a capability that was previously revoked when the agent calls /agent/request-capability", async () => {
    // Revoke "transfer" (currently auto-granted from the host's default
    // capabilities). The agent then re-requests it via the standard
    // request-capability flow — the host budget still includes "transfer",
    // but the prior explicit revoke must override the budget. The agent
    // should get a pending grant + approval flow, not a fresh active grant.
    await client.authedPost(
      "/agent/revoke-capability",
      { agent_id: fixture.agentId, capabilities: ["transfer"] },
      sessionCookie,
    );

    const agentJWT = await createAgentJWT(fixture.agentKeypair.privateKey, fixture.agentId);
    const res = await client.api("/agent/request-capability", {
      method: "POST",
      headers: { authorization: `Bearer ${agentJWT}` },
      body: JSON.stringify({ capabilities: ["transfer"] }),
    });
    expect(res.ok).toBe(true);
    const body = await json<{
      status: string;
      agent_capability_grants: Array<{ status: string; capability: string }>;
    }>(res);
    expect(body.status).toBe("pending");
    const transferGrant = body.agent_capability_grants.find((g) => g.capability === "transfer");
    expect(transferGrant?.status).toBe("pending");

    // And the prior revoked row is still in the table — re-request must not
    // bulk-resurrect it. Use the adapter to spot-check.
    const context = await auth.$context;
    const allTransferGrants = (await context.adapter.findMany({
      model: "agentCapabilityGrant",
      where: [
        { field: "agentId", value: fixture.agentId },
        { field: "capability", value: "transfer" },
      ],
    })) as Array<{ status: string }>;
    const statuses = allTransferGrants.map((g) => g.status).sort();
    expect(statuses).toContain("revoked");
    expect(statuses).toContain("pending");
    // The active grant from the original auto-approve was flipped to revoked,
    // so we should not see two actives here.
    expect(statuses.filter((s) => s === "active")).toHaveLength(0);
  });
});
