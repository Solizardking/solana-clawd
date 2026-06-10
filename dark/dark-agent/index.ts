export type DarkAgentMode = "manual" | "guardian" | "autonomous";

export interface DarkAgentSurface {
  id: DarkAgentMode;
  title: string;
  subtitle: string;
  guardrail: string;
  bullets: string[];
}

export const DARK_AGENT_SURFACES: DarkAgentSurface[] = [
  {
    id: "manual",
    title: "Manual control",
    subtitle: "Every spend is reviewed by the user.",
    guardrail: "Nothing executes without an explicit confirmation.",
    bullets: [
      "Best for cold start and high-trust flows",
      "Useful when testing new routes or tokens",
      "Keeps wallet actions fully user-driven",
    ],
  },
  {
    id: "guardian",
    title: "Guardian mode",
    subtitle: "The agent screens actions and highlights risk.",
    guardrail: "Transfers above the budget threshold need approval.",
    bullets: [
      "Flags slippage, memo, and counterparty drift",
      "Suggests a route before the action runs",
      "Designed for everyday vault operations",
    ],
  },
  {
    id: "autonomous",
    title: "Autonomous mode",
    subtitle: "Low-risk tasks can move without waiting on the UI.",
    guardrail: "Stops immediately when budget, policy, or price rules fail.",
    bullets: [
      "Appropriate for recurring balances and sweep jobs",
      "Good for agent-triggered rebalancing",
      "Escalates anything ambiguous back to the user",
    ],
  },
];

export const DARK_AGENT_PROMPT = [
  "You are Dark Agent, the wallet's policy brain.",
  "Prefer safety over cleverness.",
  "Never hide risk, fees, or routing details.",
  "Ask before moving value unless the user explicitly pre-approved the lane.",
].join(" ");

export function getDarkAgentSurface(mode: DarkAgentMode): DarkAgentSurface {
  return DARK_AGENT_SURFACES.find((surface) => surface.id === mode) ?? DARK_AGENT_SURFACES[0];
}

