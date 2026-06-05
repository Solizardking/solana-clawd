import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { printSection, printOk, printInfo, printWarn } from "../banner.js";

// Mirrors dist/agent/goals.d.ts Goal type + the generator's GoalSmart shape
interface TradingGoal {
  id: string;
  active: boolean;
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  skill: "perps" | "spot" | "custom";
  symbol?: string;
  side?: "long" | "short" | "buy" | "sell";
  notionalUsd?: number;
  leverage?: number;
  targetPrice?: number;
  createdAt: string;
  completedAt?: string;
}

function goalsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const cliRoot = join(dirname(thisFile), "../..");
  const repoGoals = join(cliRoot, "../../goals");
  if (existsSync(repoGoals)) return repoGoals;
  return join(homedir(), ".openclawd", "goals");
}

function loadGoals(): TradingGoal[] {
  const dir = goalsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf-8")) as TradingGoal;
      } catch {
        return null;
      }
    })
    .filter((g): g is TradingGoal => g !== null);
}

function saveGoal(goal: TradingGoal): void {
  const dir = goalsDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${goal.id}.json`), JSON.stringify(goal, null, 2) + "\n");
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function runGoalCreate(opts: {
  category?: string;
  symbol?: string;
  side?: string;
  notional?: string;
  leverage?: string;
  target?: string;
  priority?: string;
}): void {
  const symbol = (opts.symbol ?? "SOL").toUpperCase();
  const side = (opts.side ?? "long") as TradingGoal["side"];
  const notional = opts.notional ? Number(opts.notional) : 100;
  const leverage = opts.leverage ? Number(opts.leverage) : 1;
  const skill = opts.category === "spot" ? "spot" : "perps";
  const priority = (opts.priority ?? "medium") as TradingGoal["priority"];

  const goal: TradingGoal = {
    id: makeId(skill),
    active: true,
    priority,
    title: `${side?.toUpperCase()} ${symbol} — $${notional} ${skill}`,
    body: [
      `Signal: ${side} ${symbol} @ $${notional} notional, ${leverage}x leverage`,
      `Skill: ${skill}`,
      `Safety: paper mode until LIVE_TRADING=true + OPERATOR_CONFIRMED=true`,
      `Endpoint: https://x402.wtf/api/perps/v1`,
    ].join("\n"),
    skill,
    symbol,
    side,
    notionalUsd: notional,
    leverage,
    targetPrice: opts.target ? Number(opts.target) : undefined,
    createdAt: new Date().toISOString(),
  };

  saveGoal(goal);
  printOk(`Goal created: ${goal.id}`);
  printInfo(`Title: ${goal.title}`);
  printInfo(`Priority: ${goal.priority}`);
  printInfo(`Stored at: ${join(goalsDir(), `${goal.id}.json`)}`);
  console.error("\n  Execute:");
  console.error(`    clawd-agents ${skill === "spot" ? "spot" : side} ${symbol} --notional ${notional}${leverage > 1 ? ` --leverage ${leverage}` : ""}`);
}

export function runGoalList(opts: { active?: boolean; json?: boolean }): void {
  const goals = loadGoals().filter((g) => !opts.active || g.active);

  if (opts.json) {
    console.log(JSON.stringify(goals, null, 2));
    return;
  }

  if (goals.length === 0) {
    printInfo("No goals found. Create one: clawd-agents goals create --symbol SOL --side long");
    return;
  }

  printSection(`Goals (${goals.length})`);
  for (const g of goals.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const status = g.active ? "●" : "○";
    const pri = g.priority === "high" ? "▲" : g.priority === "low" ? "▼" : "─";
    console.error(`  ${status} ${pri} [${g.id}] ${g.title}`);
  }
}

export function runGoalStatus(id: string, opts: { json?: boolean }): void {
  const goals = loadGoals();
  const goal = goals.find((g) => g.id === id || g.id.startsWith(id));
  if (!goal) {
    throw new Error(`Goal '${id}' not found. Run: clawd-agents goals list`);
  }
  if (opts.json) {
    console.log(JSON.stringify(goal, null, 2));
    return;
  }
  printSection(`Goal: ${goal.title}`);
  console.error(`\n  ID:       ${goal.id}`);
  console.error(`  Active:   ${goal.active}`);
  console.error(`  Priority: ${goal.priority}`);
  console.error(`  Skill:    ${goal.skill}`);
  if (goal.symbol) console.error(`  Symbol:   ${goal.symbol}`);
  if (goal.side) console.error(`  Side:     ${goal.side}`);
  if (goal.notionalUsd) console.error(`  Notional: $${goal.notionalUsd}`);
  if (goal.leverage && goal.leverage > 1) console.error(`  Leverage: ${goal.leverage}x`);
  if (goal.targetPrice) console.error(`  Target:   $${goal.targetPrice}`);
  console.error(`  Created:  ${goal.createdAt}`);
  console.error(`\n  Body:\n    ${goal.body.replace(/\n/g, "\n    ")}`);
}

export function runGoalComplete(id: string): void {
  const goals = loadGoals();
  const goal = goals.find((g) => g.id === id || g.id.startsWith(id));
  if (!goal) throw new Error(`Goal '${id}' not found.`);
  goal.active = false;
  goal.completedAt = new Date().toISOString();
  saveGoal(goal);
  printOk(`Goal completed: ${goal.id}`);
}
