/**
 * In-repo checks for the cli/ package: JSON parse, shared service bases,
 * identity alignment with clawd-register.ts, and bash -n on both shells.
 * Drives the real files under cli/ — no hardcoded always-pass fixtures.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const CLI_DIR = dirname(fileURLToPath(import.meta.url));

/** Defaults must match shipped shells + register module + JSON (solanaclawd.com). */
const EXPECTED_BASES = {
  site: "https://solanaclawd.com",
  api: "https://solanaclawd.com/api",
  marketplace: "https://solanaclawd.com/marketplace",
  // Live facilitator JSON is under /api/x402
  x402: "https://solanaclawd.com/api/x402",
  mcp: "https://solanaclawd.com/mcp",
  a2a: "https://solanaclawd.com/a2a",
} as const;

function readJson(name: string): unknown {
  const path = join(CLI_DIR, name);
  expect(existsSync(path), `missing ${path}`).toBe(true);
  return JSON.parse(readFileSync(path, "utf8"));
}

function serviceMap(
  services: Array<{ name: string; endpoint: string }>,
): Map<string, string> {
  return new Map(services.map((s) => [s.name.toLowerCase(), s.endpoint]));
}

describe("cli/ JSON package", () => {
  it("parses all three registration/config JSON files", () => {
    for (const name of [
      "clawd-openclaw-config.json",
      "clawd-registration.json",
      "solana-clawd-registration.json",
    ]) {
      const data = readJson(name);
      expect(data).toBeTypeOf("object");
      expect(data).not.toBeNull();
    }
  });

  it("does not use the invalid spaced protocols key in registration", () => {
    const reg = readJson("clawd-registration.json") as {
      capabilities?: { trading?: Record<string, unknown> };
    };
    const trading = reg.capabilities?.trading ?? {};
    expect(Object.keys(trading)).not.toContain(" protocols");
    expect(trading.protocols).toEqual(
      expect.arrayContaining(["pump.fun", "jupiter", "raydium"]),
    );
  });

  it("aligns openclawd registration and config service bases", () => {
    const reg = readJson("clawd-registration.json") as {
      name: string;
      services: Array<{ name: string; endpoint: string }>;
      supportedTrust: string[];
    };
    const cfg = readJson("clawd-openclaw-config.json") as {
      name: string;
      services: Array<{ name: string; endpoint: string }>;
      supportedTrust?: string[];
    };

    expect(reg.name).toBe("openclawd");
    expect(cfg.name).toBe("openclawd");

    const regMap = serviceMap(reg.services);
    const cfgMap = serviceMap(cfg.services);

    for (const key of ["api", "marketplace", "x402", "mcp"] as const) {
      expect(regMap.get(key), `reg missing ${key}`).toBe(EXPECTED_BASES[key]);
      expect(cfgMap.get(key), `cfg missing ${key}`).toBe(EXPECTED_BASES[key]);
    }
    // dashboard / site
    expect(regMap.get("dashboard") ?? regMap.get("web")).toBe(
      EXPECTED_BASES.site,
    );
    expect(cfgMap.get("dashboard") ?? cfgMap.get("web")).toBe(
      EXPECTED_BASES.site,
    );

    for (const t of ["wallet-verified", "token-holder"]) {
      expect(reg.supportedTrust).toContain(t);
      if (cfg.supportedTrust) {
        expect(cfg.supportedTrust).toContain(t);
      }
    }
  });

  it("aligns Solana Clawd registration identity fields", () => {
    const sol = readJson("solana-clawd-registration.json") as {
      name: string;
      description: string;
      services: Array<{ name: string; endpoint: string }>;
      supportedTrust: string[];
    };
    expect(sol.name).toBe("Solana Clawd");
    expect(sol.description.length).toBeGreaterThan(20);
    expect(sol.supportedTrust).toEqual(
      expect.arrayContaining(["wallet-verified", "token-holder"]),
    );
    const map = serviceMap(sol.services);
    expect(map.get("web")).toBe(EXPECTED_BASES.site);
    expect(map.get("mcp")).toBe(EXPECTED_BASES.mcp);
    expect(map.get("a2a")).toBe(EXPECTED_BASES.a2a);
  });

  it("default service hosts are solanaclawd.com (not onchainai.com)", () => {
    for (const name of [
      "clawd-registration.json",
      "clawd-openclaw-config.json",
      "solana-clawd-registration.json",
    ]) {
      const raw = readFileSync(join(CLI_DIR, name), "utf8");
      expect(raw).not.toContain("onchainai.com");
      expect(raw).toContain("solanaclawd.com");
    }
  });
});

describe("cli/ shell scripts", () => {
  it("bash -n passes for both entry points", () => {
    for (const script of ["clawd-cli.sh", "clawd-connect.sh"]) {
      const path = join(CLI_DIR, script);
      const r = spawnSync("bash", ["-n", path], { encoding: "utf8" });
      expect(r.status, r.stderr || r.stdout).toBe(0);
    }
  });

  it("shell sources default to solanaclawd.com and live /api/x402 facilitator", () => {
    const cli = readFileSync(join(CLI_DIR, "clawd-cli.sh"), "utf8");
    const connect = readFileSync(join(CLI_DIR, "clawd-connect.sh"), "utf8");
    for (const src of [cli, connect]) {
      expect(src).toContain("https://solanaclawd.com");
      expect(src).not.toContain("https://onchainai.com");
      // Default gateway is API_BASE/x402 so payment:supported hits live JSON
      expect(src).toMatch(
        /X402_GATEWAY=.*\$\{API_BASE\}\/x402|X402_GATEWAY=.*solanaclawd\.com\/api\/x402/,
      );
      expect(src).toContain("${X402_GATEWAY}/facilitator/supported");
      expect(src).not.toContain("/CLI/");
      expect(src).not.toMatch(/\$\(pwd\)\/CLI/);
    }
  });

  it("scripts resolve paths relative to cli/ via SCRIPT_DIR", () => {
    const cli = readFileSync(join(CLI_DIR, "clawd-cli.sh"), "utf8");
    const connect = readFileSync(join(CLI_DIR, "clawd-connect.sh"), "utf8");
    for (const src of [cli, connect]) {
      expect(src).toContain("SCRIPT_DIR=");
      expect(src).toContain("BASH_SOURCE[0]");
      expect(src).toContain("clawd-register.ts");
    }
  });

  it("help output lists primary command families and cli/ path", () => {
    const r = spawnSync("bash", [join(CLI_DIR, "clawd-cli.sh"), "help"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/skills/i);
    expect(out).toMatch(/marketplace/i);
    expect(out).toMatch(/payment:supported|Payments/i);
    expect(out).toMatch(/agents|connect|status/i);
    expect(out).not.toMatch(/\$\(pwd\)\/CLI|path under CLI\//i);
    // install path points at real cli dir
    expect(out).toContain(CLI_DIR);
  });

  it("connect help also lists skills/marketplace/payments", () => {
    const r = spawnSync("bash", [join(CLI_DIR, "clawd-connect.sh"), "help"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/skills/i);
    expect(out).toMatch(/marketplace/i);
    expect(out).toMatch(/payment:supported|PAYMENTS/i);
    expect(out).toContain(CLI_DIR);
  });
});

describe("cli/clawd-register.ts module", () => {
  it("loads without secrets and exports identity + bases", async () => {
    const mod = await import(join(CLI_DIR, "clawd-register.ts"));
    expect(mod.SOLANA_CLAWD_AGENT_METADATA.name).toBe("Solana Clawd");
    expect(mod.OPENCLAWD_REGISTRATION.name).toBe("openclawd");
    expect(mod.SERVICE_BASES.api).toBe(EXPECTED_BASES.api);
    expect(mod.SERVICE_BASES.x402).toBe(EXPECTED_BASES.x402);
    expect(mod.SERVICE_BASES.marketplace).toBe(EXPECTED_BASES.marketplace);
    expect(mod.SERVICE_BASES.mcp).toBe(EXPECTED_BASES.mcp);
    expect(mod.SERVICE_BASES.site).toBe(EXPECTED_BASES.site);
    expect(mod.ATTESTATION_SCHEMAS.SKILL.name).toBe(
      "OpenClawdSkillAttestation",
    );
    expect(typeof mod.cliCommands.attestSkill).toBe("function");
    expect(typeof mod.mintSolanaClawdAgent).toBe("function");
    expect(typeof mod.diffSolanaClawdIdentity).toBe("function");
  });

  it("Solana Clawd metadata matches registration JSON on shared fields", async () => {
    const mod = await import(join(CLI_DIR, "clawd-register.ts"));
    const diffs = mod.diffSolanaClawdIdentity() as string[];
    expect(diffs, diffs.join("; ")).toEqual([]);

    const file = mod.loadSolanaClawdRegistrationJson() as {
      name: string;
      description: string;
      services: Array<{ name: string; endpoint: string }>;
      supportedTrust: string[];
    };
    const meta = mod.SOLANA_CLAWD_AGENT_METADATA;
    expect(meta.name).toBe(file.name);
    expect(meta.description).toBe(file.description);
    expect([...meta.supportedTrust].sort()).toEqual(
      [...file.supportedTrust].sort(),
    );
    const fileMap = serviceMap(file.services);
    for (const s of meta.services) {
      expect(fileMap.get(s.name.toLowerCase())).toBe(s.endpoint);
    }
  });

  it("openclawd registration endpoints match SERVICE_BASES", async () => {
    const mod = await import(join(CLI_DIR, "clawd-register.ts"));
    const bases = mod.SERVICE_BASES;
    const open = mod.OPENCLAWD_REGISTRATION;
    const map = serviceMap(
      open.services as Array<{ name: string; endpoint: string }>,
    );
    expect(map.get("api")).toBe(bases.api);
    expect(map.get("marketplace")).toBe(bases.marketplace);
    expect(map.get("x402")).toBe(bases.x402);
    expect(map.get("mcp")).toBe(bases.mcp);
    expect(map.get("a2a")).toBe(bases.a2a);
  });
});

describe("cli/README.md", () => {
  it("documents cli/ install path and solanaclawd.com defaults", () => {
    const readme = readFileSync(join(CLI_DIR, "README.md"), "utf8");
    expect(readme).toContain("cli/clawd-cli.sh");
    expect(readme).toContain("cli/clawd-connect.sh");
    expect(readme).toContain("chmod +x cli/clawd-cli.sh");
    expect(readme).toMatch(/\$\(pwd\)\/cli/);
    expect(readme).not.toMatch(/\$\(pwd\)\/CLI\b/);
    expect(readme).toContain("https://solanaclawd.com");
    expect(readme).toContain(
      "https://solanaclawd.com/api/x402/facilitator/supported",
    );
    expect(readme).not.toContain("https://onchainai.com");
  });
});

// Allow running as a plain node script for evidence capture
if (process.argv[1] && process.argv[1].endsWith("cli-package.test.ts")) {
  // vitest is the primary runner; this branch is unused when vitest loads the file
  void execFileSync;
}
