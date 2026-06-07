import type { MetadataRoute } from "next";

const SITE_URL = "https://agent-auth.directory";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/providers", "/providers/", "/search", "/submit"],
        disallow: ["/api/", "/my-providers", "/sign-in", "/consent", "/.well-known/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
