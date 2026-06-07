import { and, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";

const SITE_URL = "https://agent-auth.directory";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/providers`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/submit`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  let providerRoutes: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({ name: provider.name, updatedAt: provider.updatedAt })
      .from(provider)
      .where(and(eq(provider.status, "active"), eq(provider.public, true)));

    providerRoutes = rows.map((row) => {
      const parsed = row.updatedAt ? new Date(row.updatedAt) : now;
      return {
        url: `${SITE_URL}/providers/${encodeURIComponent(row.name)}`,
        lastModified: Number.isNaN(parsed.getTime()) ? now : parsed,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      };
    });
  } catch (err) {
    console.error("sitemap: failed to enumerate providers, returning static-only:", err);
  }

  return [...staticRoutes, ...providerRoutes];
}
