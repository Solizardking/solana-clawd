import { execSync } from "node:child_process";
import { printSection, printOk, printInfo, printWarn } from "../banner.js";
import {
  CLAWD_PROJECT_ID,
  CLAWD_PROJECT_NUMBER,
  CLAWD_REASONING_ENGINE_LOCATION,
  CLAWD_REASONING_ENGINE_ID,
  CLAWD_REASONING_ENGINE_URN,
  CLAWD_SA,
  REGISTERED_ENDPOINTS,
  RegisteredEndpoint,
} from "../registry-data.js";

export function runRegistryList(): void {
  printSection("Google Agent Registry — x402.wtf endpoints");
  console.error(`\n  Project: ${CLAWD_PROJECT_ID}  (number: ${CLAWD_PROJECT_NUMBER})\n`);

  const maxName = Math.max(...REGISTERED_ENDPOINTS.map((e) => e.name.length));
  for (const ep of REGISTERED_ENDPOINTS) {
    const pad = " ".repeat(maxName - ep.name.length + 2);
    console.error(`  ${ep.name}${pad}${ep.location}   ${ep.url}`);
  }

  console.error(`\n  Reasoning Engine:`);
  console.error(`    URN:      ${CLAWD_REASONING_ENGINE_URN}`);
  console.error(`    Location: ${CLAWD_REASONING_ENGINE_LOCATION}`);
  console.error(`    ID:       ${CLAWD_REASONING_ENGINE_ID}`);
  console.error(`    SA:       ${CLAWD_SA}`);
}

export function runRegistryConnect(endpointName: string): void {
  const ep = REGISTERED_ENDPOINTS.find(
    (e) => e.name.toLowerCase().includes(endpointName.toLowerCase()) ||
           e.url.includes(endpointName),
  );

  if (!ep) {
    const names = REGISTERED_ENDPOINTS.map((e) => e.name).join("\n  ");
    throw new Error(`Endpoint '${endpointName}' not found.\n\nAvailable:\n  ${names}`);
  }

  printSection(`Connect → ${ep.name}`);
  console.error(`\n  URL:         ${ep.url}`);
  console.error(`  Location:    ${ep.location}`);
  console.error(`  Description: ${ep.description}`);
  console.error(`\n  Example (fetch with CAAP/1.0 auth):`);
  console.error(`\n    import { createClawdAgentClient } from "@solanaclawd/clawd-agents-cli/auth";`);
  console.error(`    const client = createClawdAgentClient();`);
  console.error(`    const token = await client.getToken();`);
  console.error(`    const res = await fetch("${ep.url}", {`);
  console.error(`      headers: { Authorization: \`Bearer \${token}\` },`);
  console.error(`    });`);
}

export function runRegistryStatus(): void {
  printSection("Agent Registry status");

  let gcloudOk = false;
  try {
    const proj = execSync("gcloud config get-value project 2>/dev/null", { encoding: "utf-8" }).trim();
    if (proj === CLAWD_PROJECT_ID) {
      printOk(`gcloud → project ${proj}`);
      gcloudOk = true;
    } else if (proj) {
      printWarn(`gcloud project is '${proj}', expected '${CLAWD_PROJECT_ID}'`);
    }
  } catch {
    printInfo("gcloud not found — install for Agent Registry management");
  }

  console.error(`\n  Endpoints:  ${REGISTERED_ENDPOINTS.length} registered in Agent Registry (global)`);
  console.error(`  Auth:       CAAP/1.0 — https://x402.wtf/.well-known/agent-auth.json`);
  console.error(`  RE Engine:  ${CLAWD_REASONING_ENGINE_LOCATION}/${CLAWD_REASONING_ENGINE_ID}`);

  if (!gcloudOk) {
    console.error(`\n  To manage via gcloud:`);
    console.error(`    gcloud config set project ${CLAWD_PROJECT_ID}`);
    console.error(`    gcloud alpha agent-registry services list --project=${CLAWD_PROJECT_ID} --location=global`);
  }
}

export function runRegistryRegister(
  endpoint: string,
  opts: { name?: string; protocol?: string; location?: string },
): void {
  const name = opts.name ?? endpoint.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const location = opts.location ?? "global";
  const protocol = opts.protocol ?? "HTTP_JSON";

  printSection(`Register endpoint in Agent Registry`);
  console.error(`\n  This will register '${endpoint}' as a managed agentic endpoint.`);
  console.error(`\n  gcloud command:`);
  console.error(`\n    gcloud alpha agent-registry services create ${name} \\`);
  console.error(`      --project=${CLAWD_PROJECT_ID} \\`);
  console.error(`      --location=${location} \\`);
  console.error(`      --display-name="${name}" \\`);
  console.error(`      --endpoint-spec-type=no-spec \\`);
  console.error(`      --interfaces=url=${endpoint},protocolBinding=${protocol}`);

  try {
    execSync("gcloud --version", { stdio: "ignore" });
    printInfo("Run the command above to register the endpoint.");
    printInfo("Note: Manual registration is not supported in 'us'/'eu' multi-regions. Use a specific region or 'global'.");
  } catch {
    printWarn("gcloud not found — copy the command above and run it in your terminal.");
  }
}
