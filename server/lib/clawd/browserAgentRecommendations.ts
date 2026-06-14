import type {
  BrowserAgent,
  BrowserAgentDoc,
  BrowserAgentLocale,
  BrowserAgentProject,
  BrowserAgentSkill,
  BrowserAgentWellKnown,
} from "./browserAgents";

export interface BrowserAgentRecommendation {
  runtime: "cheshire-chat" | "telegram-agent" | "metaplex-mint" | "browser-template" | "external-subproject";
  provider: "deepseek" | "openai" | "xai" | "kimi";
  model: string;
  confidence: "high" | "medium";
  reasons: string[];
  setup: string[];
  recommendedSkills: BrowserAgentSkill[];
  recommendedProjects: BrowserAgentProject[];
  recommendedDocs: BrowserAgentDoc[];
  localePack: BrowserAgentLocale | null;
  deployPaths: Array<{ label: string; path: string }>;
  discovery: BrowserAgentWellKnown[];
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function includesAny(haystack: string[], needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function deriveBrowserAgentRecommendation(
  agent: BrowserAgent,
  context: {
    skills: BrowserAgentSkill[];
    projects: BrowserAgentProject[];
    docs: BrowserAgentDoc[];
    locales: BrowserAgentLocale[];
    wellKnown: BrowserAgentWellKnown[];
  },
): BrowserAgentRecommendation {
  const tags = (agent.tags ?? []).map((tag) => tag.toLowerCase());
  const capabilities = (agent.capabilities ?? []).map((capability) => capability.toLowerCase());
  const id = agent.id.toLowerCase();
  const reasons: string[] = [];
  const setup: string[] = [];
  const recommendedSkills: BrowserAgentSkill[] = [];
  const recommendedProjects: BrowserAgentProject[] = [];
  const recommendedDocs: BrowserAgentDoc[] = [];

  let runtime: BrowserAgentRecommendation["runtime"] = "cheshire-chat";
  let provider: BrowserAgentRecommendation["provider"] = "xai";
  let model = "grok-4";
  let confidence: BrowserAgentRecommendation["confidence"] = "medium";

  const addSkillById = (...skillIds: string[]) => {
    for (const skillId of skillIds) {
      const match = context.skills.find((skill) => skill.id === skillId);
      if (match) recommendedSkills.push(match);
    }
  };

  const addProjectById = (...projectIds: string[]) => {
    for (const projectId of projectIds) {
      const match = context.projects.find((project) => project.id === projectId);
      if (match) recommendedProjects.push(match);
    }
  };

  const addDocById = (...docIds: string[]) => {
    for (const docId of docIds) {
      const match = context.docs.find((doc) => doc.id === docId);
      if (match) recommendedDocs.push(match);
    }
  };

  if (agent.category === "trading") {
    provider = "deepseek";
    model = "deepseek-v4-pro";
    confidence = "high";
    reasons.push("Trading agents need disciplined reasoning and structured multi-step decisioning.");
    setup.push("Configure Solana RPC and trading wallet env before enabling any live execution path.");
    addDocById("deployment", "models", "troubleshooting");
  } else if (agent.category === "security") {
    provider = "openai";
    model = "gpt-4o";
    confidence = "high";
    reasons.push("Security-style agents benefit from stricter review and conservative response behavior.");
    addDocById("deployment", "faq", "troubleshooting");
  } else if (agent.category === "payments") {
    provider = "openai";
    model = "gpt-4o-mini";
    reasons.push("Payment and routing agents should stay lightweight and tool-oriented.");
    addDocById("api", "deployment");
  } else if (agent.category === "defi") {
    provider = "xai";
    model = "grok-4";
    reasons.push("DeFi strategy agents need broader market context and synthesis.");
    addDocById("agent_guide", "examples", "models");
  }

  if (includesAny(tags, ["telegram", "bot"]) || id.includes("telegram")) {
    runtime = "telegram-agent";
    confidence = "high";
    reasons.push("The imported profile aligns with Cheshire's persistent Telegram-hosted agent surface.");
    setup.push("Set TELEGRAM_AGENT_HOST_BOT_TOKEN and TELEGRAM_AGENT_HOST_BOT_USERNAME for persistent chat delivery.");
  }

  if (agent.metaplexSkills.length > 0 || id.includes("registry") || id.includes("mint")) {
    runtime = "metaplex-mint";
    reasons.push("This agent already references Metaplex registry skills and should pair with on-chain mint/registration.");
    setup.push("Use the Metaplex mint flow after bootstrapping the persona so the agent can live as an on-chain registry asset.");
    addProjectById("agent-minter", "Agent-Staking_Unstaking_solana_metaplex_core");
    addDocById("deployment", "api");
  }

  if (includesAny(tags, ["pumpfun", "pumpswap", "copy-trading"]) || id.includes("pumpfun")) {
    runtime = "external-subproject";
    reasons.push("The source repo includes a dedicated Pump.fun Rust bot subproject that should inform execution architecture.");
    setup.push("Use Cheshire as the orchestration/persona shell, but treat the Rust bot as the execution backend for live copy-trading.");
    addProjectById("solana-pumpfun-bot-master");
    addSkillById("pump-solana-dev", "pump-sdk-core", "pump-testing", "pump-security");
    addDocById("deployment", "workflow", "troubleshooting");
  }

  if (id.includes("vulcan") || includesAny(tags, ["perps", "phoenix", "vulcan"])) {
    runtime = "external-subproject";
    reasons.push("Phoenix perps and Vulcan flows depend on specialized market/preflight surfaces already imported from the repo.");
    setup.push("Pair this agent with Phoenix/Vulcan configuration and keep live execution behind preflight + operator approval.");
    addProjectById("clawd-agents-perps");
    addDocById("deployment", "examples", "workflow");
  }

  if (id.includes("orchestrator") || includesAny(tags, ["multi-agent", "orchestration", "payments"])) {
    runtime = "cheshire-chat";
    reasons.push("This profile is best used as a Cheshire-native coordinator that delegates to external agents and gateways.");
    setup.push("Wire this agent to Cheshire router/backroom/payment gateway env before giving it paid-call authority.");
    addProjectById("plugin.delivery", "cloudflare-agent-api", "defi-agents");
    addDocById("api", "deployment", "workflow");
  }

  if (includesAny(capabilities, ["a2a-message"]) || agent.source.deploy) {
    reasons.push("The imported deploy metadata already defines catalog/chat/mint/registration paths.");
    setup.push("Preserve the original deploy path semantics when adapting this agent to Cheshire routes.");
  }

  const localePack = context.locales.find((locale) => locale.id === agent.id)
    ?? (agent.localeCoverage
      ? {
          id: agent.id,
          localeCount: agent.localeCoverage.localeCount,
          locales: agent.localeCoverage.locales,
          defaultTitle: agent.localeCoverage.defaultTitle,
          defaultDescription: agent.localeCoverage.defaultDescription,
          openingMessage: agent.openingMessage,
          openingQuestions: agent.openingQuestions,
          fileCount: 0,
          baseFile: agent.source.file,
        }
      : null);
  if (localePack && localePack.localeCount > 1) {
    reasons.push(`This agent ships with ${localePack.localeCount} locale variants that can inform multilingual delivery.`);
    setup.push("Keep the English core persona for builder defaults, then use locale packs for future multilingual surfaces.");
    addDocById("i18n_workflow");
  }

  if (context.wellKnown.length > 0) {
    addDocById("api");
  }

  const deployPaths = Object.entries(agent.source.deploy ?? {}).map(([label, path]) => ({
    label,
    path: String(path),
  }));

  return {
    runtime,
    provider,
    model,
    confidence,
    reasons,
    setup,
    recommendedSkills: uniqueById(recommendedSkills),
    recommendedProjects: uniqueById(recommendedProjects),
    recommendedDocs: uniqueById(recommendedDocs),
    localePack: localePack ?? null,
    deployPaths,
    discovery: context.wellKnown,
  };
}
