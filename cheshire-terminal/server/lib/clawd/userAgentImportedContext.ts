import type { UserAgent } from "@shared/schema";
import { getBrowserAgent, loadBrowserAgents } from "./browserAgents";
import { deriveBrowserAgentRecommendation } from "./browserAgentRecommendations";
import { getPlatformContextForUserAgent, type AgentPlatformContext } from "./platformContext";
import { getRelevantRepoAssetsForUserAgent } from "./relevantRepoAssets";

export interface ResolvedUserAgentImportedContext {
  sourceAgent: {
    id: string;
    title: string;
    category: string;
    description: string;
    capabilities: string[];
    openingMessage: string;
    openingQuestions: string[];
    skillPaths: string[];
    metaplexSkills: string[];
    vulcanSkills: string[];
  } | null;
  recommendation: ReturnType<typeof deriveBrowserAgentRecommendation> | null;
  docs: Array<{ id: string; title: string; summary: string }>;
  skills: Array<{ id: string; title: string; summary: string }>;
  projects: Array<{ id: string; title: string; kind: string; summary: string }>;
  localePack: {
    id: string;
    localeCount: number;
    locales: string[];
    defaultTitle: string;
    defaultDescription: string;
  } | null;
  character: {
    id: string;
    name: string;
    adjectives: string[];
    topics: string[];
    bio: string[];
  } | null;
  template: {
    id: string;
    name: string;
    category: string | null;
    avatar: string | null;
    openingQuestions: string[];
    commandHints: string[];
    toolNames: string[];
    capabilityKeys: string[];
  } | null;
  launchDefaults: {
    systemRole: string | null;
    openingMessage: string | null;
    openingQuestions: string[];
    commandHints: string[];
    toolNames: string[];
    capabilityKeys: string[];
    traitHints: string[];
    topicHints: string[];
  } | null;
  discovery: Array<{ id: string; scope: string; filename: string; summary: string }>;
  repoAssets: ReturnType<typeof getRelevantRepoAssetsForUserAgent>;
  platformContext: AgentPlatformContext;
}

export function resolveUserAgentImportedContext(userAgent: UserAgent): ResolvedUserAgentImportedContext | null {
  const payload = loadBrowserAgents();
  const imported = (userAgent.importedSpec ?? {}) as Record<string, any>;
  const sourceAgentId = String(userAgent.sourceAgentId ?? imported.sourceAgentId ?? "").trim();
  const sourceAgent = sourceAgentId ? getBrowserAgent(sourceAgentId) : null;

  if (!sourceAgent && !imported.recommendation && !imported.docs && !imported.skills && !imported.projects) {
    return null;
  }

  const recommendation = sourceAgent
    ? deriveBrowserAgentRecommendation(sourceAgent, payload)
    : (imported.recommendation as ReturnType<typeof deriveBrowserAgentRecommendation> | null) ?? null;

  const docIds = new Set<string>([
    ...((imported.docs as string[] | undefined) ?? []),
    ...(recommendation?.recommendedDocs.map((doc) => doc.id) ?? []),
  ]);
  const skillIds = new Set<string>([
    ...((imported.skills as string[] | undefined) ?? []),
    ...(recommendation?.recommendedSkills.map((skill) => skill.id) ?? []),
  ]);
  const projectIds = new Set<string>([
    ...((imported.projects as string[] | undefined) ?? []),
    ...(recommendation?.recommendedProjects.map((project) => project.id) ?? []),
  ]);
  const selectedCharacterId = String(imported.character?.id ?? "").trim();
  const selectedTemplateId = String(imported.template?.id ?? "").trim();
  const selectedCharacter = selectedCharacterId
    ? payload.characters.find((character) => character.id === selectedCharacterId) ?? null
    : null;
  const selectedTemplate = selectedTemplateId
    ? payload.browserTemplates.find((template) => template.id === selectedTemplateId)
        ?? payload.templates.find((template) => template.id === selectedTemplateId)
        ?? null
    : null;
  const importedTemplate = (imported.template ?? {}) as Record<string, any>;
  const importedLaunchDefaults = (imported.launchDefaults ?? {}) as Record<string, any>;
  const templateRaw = (selectedTemplate?.raw ?? importedTemplate.raw ?? {}) as Record<string, any>;
  const templateAgent = (templateRaw.agent ?? {}) as Record<string, any>;
  const templateConfig = (templateAgent.config ?? templateRaw.config ?? {}) as Record<string, any>;
  const templateCommands = Array.isArray(templateRaw.commands)
    ? templateRaw.commands
    : Array.isArray(templateAgent.commands)
      ? templateAgent.commands
      : [];
  const templateTools = (templateRaw.tools ?? templateAgent.tools ?? {}) as Record<string, unknown>;
  const templateCapabilities = (templateRaw.capabilities ?? {}) as Record<string, unknown>;

  return {
    sourceAgent: sourceAgent
      ? {
          id: sourceAgent.id,
          title: sourceAgent.title,
          category: sourceAgent.category,
          description: sourceAgent.description,
          capabilities: sourceAgent.capabilities,
          openingMessage: sourceAgent.openingMessage,
          openingQuestions: sourceAgent.openingQuestions,
          skillPaths: sourceAgent.skillPaths,
          metaplexSkills: sourceAgent.metaplexSkills,
          vulcanSkills: sourceAgent.vulcanSkills,
        }
      : null,
    recommendation,
    docs: payload.docs
      .filter((doc) => docIds.has(doc.id))
      .map((doc) => ({ id: doc.id, title: doc.title, summary: doc.summary })),
    skills: payload.skills
      .filter((skill) => skillIds.has(skill.id))
      .map((skill) => ({ id: skill.id, title: skill.title, summary: skill.summary })),
    projects: payload.projects
      .filter((project) => projectIds.has(project.id))
      .map((project) => ({ id: project.id, title: project.title, kind: project.kind, summary: project.summary })),
    localePack: sourceAgent?.localeCoverage
      ? {
          id: sourceAgent.id,
          localeCount: sourceAgent.localeCoverage.localeCount,
          locales: sourceAgent.localeCoverage.locales,
          defaultTitle: sourceAgent.localeCoverage.defaultTitle,
          defaultDescription: sourceAgent.localeCoverage.defaultDescription,
        }
      : recommendation?.localePack
        ? {
            id: recommendation.localePack.id,
            localeCount: recommendation.localePack.localeCount,
            locales: recommendation.localePack.locales,
            defaultTitle: recommendation.localePack.defaultTitle,
            defaultDescription: recommendation.localePack.defaultDescription,
          }
        : null,
    character: selectedCharacter
      ? {
          id: selectedCharacter.id,
          name: selectedCharacter.name,
          adjectives: selectedCharacter.adjectives,
          topics: selectedCharacter.topics,
          bio: selectedCharacter.bio,
        }
      : imported.character
        ? {
            id: String(imported.character.id ?? ""),
            name: String(imported.character.name ?? ""),
            adjectives: Array.isArray(imported.character.adjectives) ? imported.character.adjectives : [],
            topics: Array.isArray(imported.character.topics) ? imported.character.topics : [],
            bio: Array.isArray(imported.character.bio) ? imported.character.bio : [],
          }
        : null,
    template: selectedTemplate || imported.template
      ? {
          id: selectedTemplate?.id ?? String(imported.template?.id ?? ""),
          name:
            String(
              templateRaw.templateName
              ?? templateRaw.displayName
              ?? templateRaw.name
              ?? imported.template?.name
              ?? selectedTemplate?.id
              ?? "",
            ),
          category:
            (typeof templateRaw.templateCategory === "string" ? templateRaw.templateCategory : null)
            ?? (typeof imported.template?.category === "string" ? imported.template.category : null),
          avatar:
            (typeof templateRaw.templateAvatar === "string" ? templateRaw.templateAvatar : null)
            ?? (typeof imported.template?.avatar === "string" ? imported.template.avatar : null),
          openingQuestions: Array.isArray(templateConfig.openingQuestions)
            ? templateConfig.openingQuestions.filter((value): value is string => typeof value === "string")
            : Array.isArray(imported.template?.openingQuestions)
              ? imported.template.openingQuestions
              : [],
          commandHints: templateCommands
            .map((command) => (command && typeof command === "object" && typeof (command as any).name === "string" ? String((command as any).name) : null))
            .filter((value): value is string => Boolean(value)),
          toolNames: Object.entries(templateTools)
            .filter(([, value]) => value === true)
            .map(([key]) => key),
          capabilityKeys: Object.keys(templateCapabilities),
        }
      : null,
    launchDefaults: imported.launchDefaults
      ? {
          systemRole: typeof importedLaunchDefaults.systemRole === "string" ? importedLaunchDefaults.systemRole : null,
          openingMessage: typeof importedLaunchDefaults.openingMessage === "string" ? importedLaunchDefaults.openingMessage : null,
          openingQuestions: Array.isArray(importedLaunchDefaults.openingQuestions) ? importedLaunchDefaults.openingQuestions : [],
          commandHints: Array.isArray(importedLaunchDefaults.commandHints) ? importedLaunchDefaults.commandHints : [],
          toolNames: Array.isArray(importedLaunchDefaults.toolNames) ? importedLaunchDefaults.toolNames : [],
          capabilityKeys: Array.isArray(importedLaunchDefaults.capabilityKeys) ? importedLaunchDefaults.capabilityKeys : [],
          traitHints: Array.isArray(importedLaunchDefaults.traitHints) ? importedLaunchDefaults.traitHints : [],
          topicHints: Array.isArray(importedLaunchDefaults.topicHints) ? importedLaunchDefaults.topicHints : [],
        }
      : null,
    discovery: (recommendation?.discovery ?? []).map((item) => ({
      id: item.id,
      scope: item.scope,
      filename: item.filename,
      summary: item.summary,
    })),
    repoAssets: getRelevantRepoAssetsForUserAgent(userAgent),
    platformContext: getPlatformContextForUserAgent(userAgent),
  };
}
