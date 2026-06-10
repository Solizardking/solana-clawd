#!/usr/bin/env tsx
/**
 * examples/01-code-execution.ts
 *
 * Run inline JS/TS/Python scripts inside a Box without an agent harness.
 * Perfect for one-off computation, data transformation, or testing.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=... npx tsx examples/01-code-execution.ts
 */
import { Box } from "@upstash/box";

async function main() {
  console.log("┌──────────────────────────────────────────────┐");
  console.log("│  Example 1: Code Execution in a Box          │");
  console.log("└──────────────────────────────────────────────┘");

  const box = await Box.create({
    apiKey: process.env.UPSTASH_BOX_API_KEY!,
    runtime: "node",
  });
  console.log(`\nBox: ${box.id}\n`);

  // 1. Run JavaScript
  console.log("=== JavaScript ===");
  const jsRun = await box.exec.code({
    code: `const data = [1,2,3,4,5];
const sum = data.reduce((a,b) => a+b, 0);
console.log(JSON.stringify({ sum, avg: sum/data.length, count: data.length }));`,
    lang: "js",
  });
  console.log("  Output:", jsRun.result.trim());
  console.log("  Exit:", jsRun.exitCode);

  // 2. Run TypeScript
  console.log("\n=== TypeScript ===");
  const tsRun = await box.exec.code({
    code: `
interface User { name: string; age: number; }
const users: User[] = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
];
const oldest = users.reduce((p,c) => p.age > c.age ? p : c);
console.log(\`Oldest: \${oldest.name} (age \${oldest.age})\`);
    `,
    lang: "ts",
  });
  console.log("  Output:", tsRun.result.trim());

  // 3. Error handling
  console.log("\n=== Error Handling ===");
  const errRun = await box.exec.code({ code: `throw new Error("boom")`, lang: "js" });
  console.log("  Exit:", errRun.exitCode);
  console.log("  Error:", errRun.result.split("\n").slice(0, 2).join("\n"));

  await box.delete();
  console.log("\n✅ Box deleted.");
}

main().catch(console.error);