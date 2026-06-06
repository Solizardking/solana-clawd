import { describe, expect, it } from "vitest";
import { getTestInstance } from "better-auth/test";
import {
  agentAuth,
  agentAuthClientPlugin,
  generateTestKeypair,
  createHostJWT,
  json,
  createTestClient,
  computeThumbprint,
  BASE,
} from "./helpers";

/**
 * Regression: registerAgent must look up hosts by both `id` and `kid`.
 *
 * The SDK signs host JWTs with `iss = JWK thumbprint` (§4.2). For hosts
 * provisioned via the enrollment-token flow, the thumbprint lives in the
 * `kid` column, not `id`. The middleware does a dual lookup
 * (findHostById ?? findHostByKid); the register route previously did an
 * id-only lookup, so pre-enrolled hosts fell through to the dynamic-
 * registration branch and failed with DYNAMIC_HOST_REGISTRATION_DISABLED
 * when the operator had disabled dynamic registration.
 *
 * Reported by .entomb on Discord, 2026-04-20.
 */
describe("registerAgent — pre-enrolled host lookup by kid (issue 1)", () => {
  it("registers an agent when iss = JWK thumbprint and dynamic registration is disabled", async () => {
    const t = await getTestInstance(
      {
        plugins: [
          agentAuth({
            providerName: "test-service",
            allowDynamicHostRegistration: false,
            capabilities: [{ name: "ping", description: "ping" }],
          }),
        ],
      },
      {
        clientOptions: { plugins: [agentAuthClientPlugin()] },
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = t.auth as any;
    const client = createTestClient((req: Request) => auth.handler(req));

    const { headers } = await t.signInWithTestUser();
    const sessionCookie = headers.get("cookie") ?? "";

    // 1. Provision a host in pending_enrollment (no public key supplied)
    const provisionRes = await client.authedPost(
      "/host/create",
      { name: "Pre-enrolled host" },
      sessionCookie,
    );
    expect(provisionRes.ok).toBe(true);
    const { hostId, enrollmentToken, status } = await json<{
      hostId: string;
      enrollmentToken: string;
      status: string;
    }>(provisionRes);
    expect(status).toBe("pending_enrollment");

    // 2. Device enrolls with its keypair — this populates the `kid`
    //    column with the JWK thumbprint and flips status to "active".
    const hostKeypair = await generateTestKeypair();
    const thumbprint = await computeThumbprint(hostKeypair.publicKey);
    const publicKeyWithKid = { ...hostKeypair.publicKey, kid: thumbprint };

    const enrollRes = await client.api("/host/enroll", {
      method: "POST",
      body: JSON.stringify({
        token: enrollmentToken,
        public_key: publicKeyWithKid,
      }),
    });
    const enrollBody = await json<Record<string, unknown>>(enrollRes);
    expect(enrollRes.ok, JSON.stringify(enrollBody)).toBe(true);
    expect(enrollBody.hostId).toBe(hostId);
    expect(enrollBody.status).toBe("active");

    // 3. Register an agent — SDK sends iss = thumbprint (per spec §4.2),
    //    not the host's UUID id. Without the kid lookup this hits the
    //    dynamic-registration branch and fails.
    const agentKeypair = await generateTestKeypair();
    const hostJWT = await createHostJWT(
      hostKeypair.privateKey,
      publicKeyWithKid,
      agentKeypair.publicKey,
      thumbprint,
    );

    const res = await client.api("/agent/register", {
      method: "POST",
      headers: { authorization: `Bearer ${hostJWT}` },
      body: JSON.stringify({ name: "Test Agent", capabilities: ["ping"] }),
    });
    const body = await json<Record<string, unknown>>(res);
    expect(res.ok, `expected 2xx but got ${res.status}: ${JSON.stringify(body)}`).toBe(true);
    expect(body).not.toHaveProperty("error", "dynamic_host_registration_disabled");
    expect(typeof body.agent_id).toBe("string");
  });

  // Sanity check: BASE is referenced indirectly via createHostJWT's audience.
  it("BASE is defined for the test client", () => {
    expect(BASE).toMatch(/^http/);
  });
});

/**
 * Regression: /agent/claim has the same single-field host lookup as
 * /agent/register did. Same root cause, same fix — covered here so we
 * don't regress when someone refactors one route without the other.
 */
describe("claimAgent — pre-enrolled host lookup by kid (issue 1, claim variant)", () => {
  it("authenticates a pre-enrolled host with iss=thumbprint when dynamic registration is disabled", async () => {
    const t = await getTestInstance(
      {
        plugins: [
          agentAuth({
            providerName: "test-service",
            allowDynamicHostRegistration: false,
            capabilities: [{ name: "ping", description: "ping" }],
          }),
        ],
      },
      {
        clientOptions: { plugins: [agentAuthClientPlugin()] },
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = t.auth as any;
    const client = createTestClient((req: Request) => auth.handler(req));

    const { headers } = await t.signInWithTestUser();
    const sessionCookie = headers.get("cookie") ?? "";

    const provisionRes = await client.authedPost(
      "/host/create",
      { name: "Pre-enrolled host" },
      sessionCookie,
    );
    const { enrollmentToken } = await json<{ enrollmentToken: string }>(provisionRes);

    const hostKeypair = await generateTestKeypair();
    const thumbprint = await computeThumbprint(hostKeypair.publicKey);
    const publicKeyWithKid = { ...hostKeypair.publicKey, kid: thumbprint };

    await client.api("/host/enroll", {
      method: "POST",
      body: JSON.stringify({
        token: enrollmentToken,
        public_key: publicKeyWithKid,
      }),
    });

    const agentKeypair = await generateTestKeypair();
    const hostJWT = await createHostJWT(
      hostKeypair.privateKey,
      publicKeyWithKid,
      agentKeypair.publicKey,
      thumbprint,
    );

    // Target a non-existent agent. We only care that host authentication
    // passes — not that the claim itself succeeds. Before the fix the
    // host lookup missed and the call failed with
    // DYNAMIC_HOST_REGISTRATION_DISABLED. After the fix it should reach
    // the claim logic and fail with AGENT_NOT_FOUND instead.
    const res = await client.api("/agent/claim", {
      method: "POST",
      headers: { authorization: `Bearer ${hostJWT}` },
      body: JSON.stringify({ agent_id: "nonexistent-agent-id" }),
    });

    expect(res.ok).toBe(false);
    const body = await json<Record<string, unknown>>(res);
    expect(body.error).not.toBe("dynamic_host_registration_disabled");
    expect(body.error).toBe("agent_not_found");
  });
});
