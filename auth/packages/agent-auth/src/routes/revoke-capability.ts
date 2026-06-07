import { createAuthEndpoint } from "@better-auth/core/api";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import type {
  Agent,
  AgentCapabilityGrant,
  AgentHost,
  AgentSession,
  HostSession,
  ResolvedAgentAuthOptions,
} from "../types";

/**
 * POST /agent/revoke-capability
 *
 * Granular counterpart to `POST /agent/grant-capability`. Revokes one or
 * more capabilities from an agent without revoking the agent itself.
 *
 * All currently-active or pending grants matching `(agent_id, capability)`
 * are flipped to `status: "revoked"`. If an agent holds multiple grants
 * for the same capability under different constraint scopes, every
 * matching grant is revoked together — callers think in terms of
 * "remove this capability", not "remove this grant row".
 *
 * After this call, `POST /capability/execute` for any revoked capability
 * returns `grant_revoked` (HTTP 403), distinguishing it from the
 * `capability_not_granted` case (never granted in the first place).
 *
 * Accepts any of:
 *   - Agent JWT — the agent voluntarily drops a capability.
 *   - Host JWT — the host revokes capabilities on an agent it owns.
 *   - User session — the user revokes capabilities on one of their agents
 *     (or on an agent attached to a host they own).
 *
 * Idempotent: revoking a capability that has no active grants returns
 * success with the list of capabilities that were actually flipped.
 */
export function revokeCapability(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/agent/revoke-capability",
    {
      method: "POST",
      body: z.object({
        agent_id: z.string().meta({
          description: "Agent to revoke capabilities from.",
        }),
        capabilities: z.array(z.string()).min(1).meta({
          description: "Capability names to revoke. All matching grants are flipped.",
        }),
      }),
      metadata: {
        openapi: {
          description: "Revoke one or more capabilities from an agent without revoking the agent.",
        },
      },
    },
    async (ctx) => {
      const agentSession = (ctx.context as Record<string, unknown>).agentSession as
        | AgentSession
        | undefined;
      const hostSession = (ctx.context as Record<string, unknown>).hostSession as
        | HostSession
        | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userSession = await getSessionFromCtx(ctx as any);

      if (!agentSession && !hostSession && !userSession) {
        throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED_SESSION);
      }

      const { agent_id: agentId, capabilities: capabilityNames } = ctx.body;

      const agent = await ctx.context.adapter.findOne<Agent>({
        model: TABLE.agent,
        where: [{ field: "id", value: agentId }],
      });

      if (!agent) {
        throw agentError("NOT_FOUND", ERR.AGENT_NOT_FOUND);
      }

      // Symmetric with /agent/grant-capability: revoking capabilities on a
      // revoked agent is a no-op semantically (all grants already revoked
      // by the cascade in /agent/revoke), but surfacing it explicitly is
      // clearer for callers than returning a silent empty diff.
      if (agent.status === "revoked") {
        throw agentError("FORBIDDEN", ERR.AGENT_REVOKED);
      }

      // Authorisation: each session type must prove ownership of the agent.
      // We mirror /agent/revoke and use opaque errors to avoid enumeration.
      if (agentSession) {
        if (agent.id !== agentSession.agent.id) {
          throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
        }
      } else if (hostSession) {
        if (agent.hostId !== hostSession.host.id) {
          throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
        }
      } else if (userSession) {
        if (agent.userId !== userSession.user.id) {
          // Fall back to host ownership: a host owner can revoke caps for
          // agents on that host even if the agent has no userId yet
          // (autonomous / pending claim).
          if (!agent.hostId) {
            throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
          }
          const host = await ctx.context.adapter.findOne<AgentHost>({
            model: TABLE.host,
            where: [{ field: "id", value: agent.hostId }],
          });
          if (!host || host.userId !== userSession.user.id) {
            throw agentError("FORBIDDEN", ERR.UNAUTHORIZED);
          }
        }
      }

      const now = new Date();
      const revoked: string[] = [];
      const grantIds: string[] = [];

      for (const capability of capabilityNames) {
        // Pull every grant for this (agent, capability) pair — there can be
        // multiple under different constraint scopes. Status filter is
        // applied after fetch so we can return an accurate diff.
        const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
          model: TABLE.grant,
          where: [
            { field: "agentId", value: agentId },
            { field: "capability", value: capability },
          ],
        });

        let flipped = false;
        for (const grant of grants) {
          if (grant.status === "revoked") continue;
          await ctx.context.adapter.update({
            model: TABLE.grant,
            where: [{ field: "id", value: grant.id }],
            update: { status: "revoked", updatedAt: now },
          });
          grantIds.push(grant.id);
          flipped = true;
        }
        if (flipped) {
          revoked.push(capability);
        }
      }

      if (revoked.length > 0) {
        emit(
          opts,
          {
            type: "capability.revoked",
            actorId:
              userSession?.user.id ??
              agentSession?.user.id ??
              hostSession?.host.userId ??
              undefined,
            agentId,
            hostId: agent.hostId ?? undefined,
            metadata: { capabilities: revoked, grantIds },
          },
          ctx,
        );
      }

      return ctx.json({
        agent_id: agentId,
        revoked,
        grant_ids: grantIds,
      });
    },
  );
}
