#!/usr/bin/env tsx
/**
 * box/scripts/list-boxes.ts
 *
 * Simple utility to list active Upstash Boxes.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... npx tsx scripts/list-boxes.ts
 */

import { Box } from "@upstash/box";

async function main() {
  if (!process.env.UPSTASH_BOX_API_KEY) throw new Error("UPSTASH_BOX_API_KEY required");

  console.log("Listing active Upstash Boxes...\n");

  try {
    // Box SDK lists via snapshot/list
    const boxes = await Box.list({
      apiKey: process.env.UPSTASH_BOX_API_KEY,
      baseUrl: process.env.UPSTASH_BOX_BASE_URL,
    });

    if (!boxes || boxes.length === 0) {
      console.log("No active boxes found.");
      return;
    }

    console.log(`Found ${boxes.length} box(es):\n`);
    for (const box of boxes) {
      console.log(`  ID:        ${box.id}`);
      console.log(`  Status:    ${box.status ?? "unknown"}`);
      console.log(`  Created:   ${box.created_at ? new Date(box.created_at).toISOString() : "unknown"}`);
      console.log(`  Runtime:   ${box.runtime ?? "unknown"}`);
      console.log("  ---");
    }
  } catch (err) {
    console.error("Error listing boxes:", err instanceof Error ? err.message : String(err));

    // Fallback: show env info
    console.log("\nBox listing requires specific API permissions.");
    console.log("Verify your UPSTASH_BOX_API_KEY is correct.");
    console.log("To manage boxes manually, use the Upstash Console.");
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
