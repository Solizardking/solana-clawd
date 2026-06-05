import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { printSection, printOk, printInfo, printWarn } from "../banner.js";
import {
  CLAWD_PROJECT_ID,
  CLAWD_REASONING_ENGINE_LOCATION,
  CLAWD_REASONING_ENGINE_ID,
  CLAWD_REASONING_ENGINE_URN,
} from "../registry-data.js";

type DeployTarget = "vercel" | "vertex-ai" | "fly" | "railway";

export function runDeploy(target: DeployTarget, opts: { prod?: boolean; dryRun?: boolean }): void {
  switch (target) {
    case "vercel":
      deployVercel(opts);
      break;
    case "vertex-ai":
      deployVertexAI(opts);
      break;
    case "fly":
      deployFly(opts);
      break;
    case "railway":
      deployRailway(opts);
      break;
    default:
      throw new Error(`Unknown deployment target: ${target}\nValid targets: vercel, vertex-ai, fly, railway`);
  }
}

function deployVercel(opts: { prod?: boolean; dryRun?: boolean }): void {
  printSection("Deploy → Vercel");

  if (!existsSync("vercel.json") && !existsSync("next.config.ts") && !existsSync("next.config.js")) {
    printWarn("No vercel.json or next.config found — make sure this is a Next.js or Vercel project");
  }

  const cmd = opts.prod ? "vercel --prod" : "vercel";
  if (opts.dryRun) {
    printInfo(`Would run: ${cmd}`);
    return;
  }

  try {
    execSync("vercel --version", { stdio: "ignore" });
  } catch {
    throw new Error("Vercel CLI not found. Install: npm i -g vercel");
  }

  printInfo(`Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
  printOk("Deployed to Vercel");
}

function deployVertexAI(opts: { prod?: boolean; dryRun?: boolean }): void {
  printSection("Deploy → Vertex AI Reasoning Engine");

  console.error(`\n  Target Engine:`);
  console.error(`    URN:      ${CLAWD_REASONING_ENGINE_URN}`);
  console.error(`    Project:  ${CLAWD_PROJECT_ID}`);
  console.error(`    Location: ${CLAWD_REASONING_ENGINE_LOCATION}`);
  console.error(`    ID:       ${CLAWD_REASONING_ENGINE_ID}`);

  console.error(`\n  The Clawd Reasoning Engine is already provisioned.`);
  console.error(`  To deploy a new agent version to it:\n`);
  console.error(`    gcloud ai reasoning-engines update ${CLAWD_REASONING_ENGINE_ID} \\`);
  console.error(`      --project=${CLAWD_PROJECT_ID} \\`);
  console.error(`      --region=${CLAWD_REASONING_ENGINE_LOCATION} \\`);
  console.error(`      --agent-framework=adk`);

  console.error(`\n  Or via Vertex AI Python SDK:`);
  console.error(`\n    from vertexai.preview import reasoning_engines`);
  console.error(`    re = reasoning_engines.ReasoningEngine("${CLAWD_REASONING_ENGINE_URN}")`);
  console.error(`    re.query(input={"message": "What is the SOL funding rate?"})`);

  if (opts.dryRun) {
    printInfo("--dry-run: no changes made");
    return;
  }

  try {
    execSync("gcloud --version", { stdio: "ignore" });
    printInfo("gcloud available — run the commands above to deploy");
  } catch {
    printWarn("gcloud not found — install Google Cloud SDK to deploy");
  }
}

function deployFly(opts: { prod?: boolean; dryRun?: boolean }): void {
  printSection("Deploy → Fly.io");

  if (!existsSync("fly.toml")) {
    printInfo("No fly.toml found. Initialize: flyctl launch");
    return;
  }

  const cmd = "flyctl deploy";
  if (opts.dryRun) {
    printInfo(`Would run: ${cmd}`);
    return;
  }

  try {
    execSync("flyctl version", { stdio: "ignore" });
  } catch {
    throw new Error("flyctl not found. Install: https://fly.io/docs/hands-on/install-flyctl/");
  }

  execSync(cmd, { stdio: "inherit" });
  printOk("Deployed to Fly.io");
}

function deployRailway(opts: { prod?: boolean; dryRun?: boolean }): void {
  printSection("Deploy → Railway");

  const cmd = "railway up";
  if (opts.dryRun) {
    printInfo(`Would run: ${cmd}`);
    return;
  }

  try {
    execSync("railway --version", { stdio: "ignore" });
  } catch {
    throw new Error("Railway CLI not found. Install: npm i -g @railway/cli");
  }

  execSync(cmd, { stdio: "inherit" });
  printOk("Deployed to Railway");
}
