import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import type { ProviderConfig } from "@/lib/discover";
import { discoverProvider } from "@/lib/discover";
import { safeJsonParse } from "@/lib/utils";

// A provider_name is a stable identifier used in URLs (/providers/<name>) and
// API responses. Restrict to a slug-like form so it round-trips cleanly.
const PROVIDER_NAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const MAX_NAME_LENGTH = 80;

const SubmitBody = z.object({
  url: z.string({ required_error: "url is required" }).url("url must be an absolute URL").max(2048),
  displayName: z.string().trim().min(1).max(120).optional(),
  categories: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  logoUrl: z.string().url().max(2048).optional(),
});

function toProviderConfig(row: typeof provider.$inferSelect): ProviderConfig {
  return {
    version: row.version,
    provider_name: row.name,
    description: row.description,
    issuer: row.issuer,
    algorithms: safeJsonParse<string[]>(row.algorithms, []),
    modes: safeJsonParse<string[]>(row.modes, []),
    approval_methods: safeJsonParse<string[]>(row.approvalMethods, []),
    endpoints: safeJsonParse<Record<string, string>>(row.endpoints, {}),
    jwks_uri: row.jwksUri ?? undefined,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(provider)
      .where(and(eq(provider.status, "active"), eq(provider.public, true)))
      .limit(limit)
      .offset(offset);

    return Response.json({
      providers: rows.map((row) => ({
        ...toProviderConfig(row),
        display_name: row.displayName,
        url: row.url,
        categories: safeJsonParse<string[]>(row.categories, []),
        logo_url: row.logoUrl,
        verified: row.verified,
        status: row.status,
      })),
      page,
      limit,
    });
  } catch (err) {
    console.error("GET /api/providers failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      return Response.json({ error: "Sign in to submit a provider" }, { status: 401 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Request body must be JSON" }, { status: 400 });
    }

    const parsed = SubmitBody.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid request body",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const body = parsed.data;
    const normalized = body.url.replace(/\/+$/, "");

    const existing = await db.select().from(provider).where(eq(provider.url, normalized)).limit(1);

    if (existing.length > 0) {
      return Response.json(
        {
          error: "A provider with this URL is already registered",
          provider: existing[0]?.name,
        },
        { status: 409 },
      );
    }

    const config = await discoverProvider(normalized);

    if (!config) {
      return Response.json(
        {
          error: "Could not discover Agent Auth configuration at this URL",
        },
        { status: 422 },
      );
    }

    const name = config.provider_name?.trim();

    if (!name || name.length > MAX_NAME_LENGTH || !PROVIDER_NAME.test(name)) {
      return Response.json(
        {
          error:
            "Provider's /.well-known/agent-configuration declares an invalid provider_name. " +
            "It must be a slug: lowercase letters, digits, dots, dashes, or underscores; " +
            "no leading/trailing punctuation; max 80 characters.",
          provider_name: name ?? null,
        },
        { status: 422 },
      );
    }

    const nameClash = await db.select().from(provider).where(eq(provider.name, name)).limit(1);

    if (nameClash.length > 0) {
      return Response.json(
        {
          error: "A provider with this provider_name is already registered",
          provider: nameClash[0]?.name,
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const row = {
      id,
      name,
      displayName: body.displayName ?? name,
      description: config.description ?? "",
      issuer: config.issuer,
      url: normalized,
      version: config.version,
      modes: JSON.stringify(config.modes),
      approvalMethods: JSON.stringify(config.approval_methods),
      algorithms: JSON.stringify(config.algorithms),
      endpoints: JSON.stringify(config.endpoints),
      jwksUri: config.jwks_uri ?? null,
      categories: JSON.stringify(body.categories ?? []),
      logoUrl: body.logoUrl ?? null,
      public: false,
      verified: false,
      lastCheckedAt: now,
      status: "active" as const,
      submittedBy: session.user.id,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(provider).values(row);

    return Response.json(
      {
        id,
        name,
        config: toProviderConfig({ ...row, jwksUri: row.jwksUri }),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/providers failed:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
