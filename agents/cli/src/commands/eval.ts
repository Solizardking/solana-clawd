import { readFileSync, existsSync } from "node:fs";
import { printOk, printWarn, printInfo } from "../banner.js";

interface AgentJson {
  identifier?: string;
  meta?: { title?: string; description?: string; tags?: string[] };
  config?: { systemRole?: string };
  agentAuth?: {
    protocol?: string;
    discovery?: string;
    registrationEndpoint?: string;
    capabilities?: unknown[];
  };
  schemaVersion?: number;
}

export function runEval(agentPath: string, opts: { strict?: boolean; json?: boolean }): void {
  if (!existsSync(agentPath)) {
    throw new Error(`File not found: ${agentPath}`);
  }

  let agent: AgentJson;
  try {
    agent = JSON.parse(readFileSync(agentPath, "utf-8")) as AgentJson;
  } catch (err) {
    throw new Error(`Invalid JSON in ${agentPath}: ${String(err)}`);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const passes: string[] = [];

  // Required fields
  if (!agent.identifier) errors.push("Missing required field: identifier");
  else passes.push(`identifier: ${agent.identifier}`);

  if (!agent.meta?.title) errors.push("Missing required field: meta.title");
  else passes.push(`title: ${agent.meta.title}`);

  if (!agent.meta?.description) warnings.push("meta.description is empty");
  else passes.push("meta.description: present");

  if (!agent.config?.systemRole) warnings.push("config.systemRole is empty — agent has no persona");
  else passes.push(`systemRole: ${agent.config.systemRole.slice(0, 60)}…`);

  if (agent.schemaVersion !== undefined) passes.push(`schemaVersion: ${agent.schemaVersion}`);
  else warnings.push("schemaVersion not set (expected: 1)");

  // CAAP/1.0
  if (agent.agentAuth) {
    if (agent.agentAuth.protocol !== "CAAP/1.0") {
      warnings.push(`agentAuth.protocol is '${agent.agentAuth.protocol}' — expected 'CAAP/1.0'`);
    } else {
      passes.push("agentAuth.protocol: CAAP/1.0");
    }
    if (!agent.agentAuth.discovery) warnings.push("agentAuth.discovery URL missing");
    else passes.push(`agentAuth.discovery: ${agent.agentAuth.discovery}`);
    const caps = Array.isArray(agent.agentAuth.capabilities) ? agent.agentAuth.capabilities.length : 0;
    passes.push(`agentAuth.capabilities: ${caps}`);
  } else if (opts.strict) {
    errors.push("agentAuth block missing (--strict requires CAAP/1.0)");
  } else {
    warnings.push("agentAuth block not present — add for CAAP/1.0 support");
  }

  if (opts.json) {
    console.log(JSON.stringify({ errors, warnings, passes, valid: errors.length === 0 }, null, 2));
    return;
  }

  for (const p of passes) printOk(p);
  for (const w of warnings) printWarn(w);
  for (const e of errors) {
    console.error(`  ✗ ${e}`);
  }

  const label = errors.length === 0 ? "VALID" : `INVALID — ${errors.length} error(s)`;
  console.error(`\n  Result: ${label}`);
  if (errors.length > 0) process.exitCode = 1;
}
