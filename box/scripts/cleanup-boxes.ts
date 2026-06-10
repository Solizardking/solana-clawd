#!/usr/bin/env tsx
/**
 * box/scripts/cleanup-boxes.ts
 *
 * Utility to clean up idle/stale Upstash Boxes to prevent
 * runaway costs.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... npx tsx scripts/cleanup-boxes.ts
 */

import { Box } from "@upstash/box";

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");

  console.log("🧹 Upstash Box Cleanup Utility\n");

  try {
    const boxes = await Box.list({
      apiKey: process.env.UPSTASH_BOX_API_KEY,
      baseUrl: process.env.UPSTASH_BOX_BASE_URL,
    });

    if (!boxes || boxes.length === 0) {
      console.log("No boxes found. Nothing to clean up.");
      return;
    }

    console.log(`Found ${boxes.length} box(es). Checking status...\n`);

    let deleted = 0;

    for (const box of boxes) {
      try {
        console.log(`  ${box.id} — status: ${box.status ?? "unknown"}`);

        // Listed boxes are BoxData records; delete by id through the SDK.
        await Box.delete({
          apiKey: process.env.UPSTASH_BOX_API_KEY,
          baseUrl: process.env.UPSTASH_BOX_BASE_URL,
          boxIds: box.id,
        });
        console.log(`    ✅ Deleted`);
        deleted++;
      } catch (err) {
        console.error(`    ❌ Delete failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`\nDone. Deleted ${deleted} box(es).`);
  } catch (err) {
    console.error("Error listing boxes:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
