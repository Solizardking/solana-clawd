#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { program } from "commander";
import * as dotenv from "dotenv";
import { GrokAgent } from "./agent/grok-agent.js";
import ChatInterface from "./ui/components/chat-interface.js";
import { getSettingsManager } from "./utils/settings-manager.js";
import { ConfirmationService } from "./utils/confirmation-service.js";
import { createMCPCommand } from "./commands/mcp.js";
import { createExamplesCommand } from "./commands/examples.js";
import { createAgentCommand } from "./commands/agent.js";
import { createCharacterCommand } from "./commands/character.js";
import { createOpenRouterCommand } from "./commands/openrouter.js";
import { createPreviewCommand } from "./commands/preview.js";
import { createCloudCommand } from "./commands/cloud.js";
import { createSkillsCommand } from "./commands/skills.js";
import { createAttestCommand } from "./commands/attest.js";
import { createNodeCommand, createMarketplaceCommand, createPayCommand } from "./commands/node.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

// Load environment variables
dotenv.config();

process.on("SIGTERM", () => {
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    try { process.stdin.setRawMode(false); } catch { /* ignore */ }
  }
  console.log("\nGracefully shutting down...");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

function ensureUserSettingsDirectory(): void {
  try {
    const manager = getSettingsManager();
    manager.loadUserSettings();
  } catch (error) {
    // Silently ignore errors during setup
  }
}

function loadApiKey(): string | undefined {
  const manager = getSettingsManager();
  return manager.getApiKey();
}

function loadBaseURL(): string {
  const manager = getSettingsManager();
  return manager.getBaseURL();
}

async function saveCommandLineSettings(
  apiKey?: string,
  baseURL?: string
): Promise<void> {
  try {
    const manager = getSettingsManager();
    if (apiKey) {
      manager.updateUserSetting("apiKey", apiKey);
      console.log("✅ API key saved to ~/.clawd/user-settings.json");
    }
    if (baseURL) {
      manager.updateUserSetting("baseURL", baseURL);
      console.log("✅ Base URL saved to ~/.clawd/user-settings.json");
    }
  } catch (error) {
    console.warn(
      "⚠️ Could not save settings to file:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

function loadModel(): string | undefined {
  let model = process.env.XAI_MODEL || process.env.GROK_MODEL;

  if (!model) {
    try {
      const manager = getSettingsManager();
      model = manager.getCurrentModel();
    } catch (error) {
      // Ignore
    }
  }

  if (!model && !process.env.XAI_API_KEY && !process.env.GROK_API_KEY && process.env.OPENROUTER_API_KEY) {
    try {
      const envModels = getSettingsManager().getEnvOpenRouterModels();
      if (envModels.length > 0) model = envModels[0];
    } catch {}
  }

  return model;
}

async function handleCommitAndPushHeadless(
  apiKey: string,
  baseURL?: string,
  model?: string,
  maxToolRounds?: number
): Promise<void> {
  try {
    const agent = new GrokAgent(apiKey, baseURL, model, maxToolRounds);

    const confirmationService = ConfirmationService.getInstance();
    confirmationService.setSessionFlag("allOperations", true);

    console.log("🤖 Processing commit and push...\n");
    console.log("> /commit-and-push\n");

    const initialStatusResult = await agent.executeBashCommand("git status --porcelain");

    if (!initialStatusResult.success || !initialStatusResult.output?.trim()) {
      console.log("❌ No changes to commit. Working directory is clean.");
      process.exit(1);
    }

    console.log("✅ git status: Changes detected");

    const addResult = await agent.executeBashCommand("git add .");
    if (!addResult.success) {
      console.log(`❌ git add: ${addResult.error || "Failed to stage changes"}`);
      process.exit(1);
    }

    console.log("✅ git add: Changes staged");

    const diffResult = await agent.executeBashCommand("git diff --cached");

    const commitPrompt = `Generate a concise, professional git commit message for these changes:

Git Status:
${initialStatusResult.output}

Git Diff (staged changes):
${diffResult.output || "No staged changes shown"}

Follow conventional commit format (feat:, fix:, docs:, etc.) and keep it under 72 characters.
Respond with ONLY the commit message, no additional text.`;

    console.log("🤖 Generating commit message...");

    const commitMessageEntries = await agent.processUserMessage(commitPrompt);
    let commitMessage = "";

    for (const entry of commitMessageEntries) {
      if (entry.type === "assistant" && entry.content.trim()) {
        commitMessage = entry.content.trim();
        break;
      }
    }

    if (!commitMessage) {
      console.log("❌ Failed to generate commit message");
      process.exit(1);
    }

    const cleanCommitMessage = commitMessage.replace(/^["']|["']$/g, "");
    console.log(`✅ Generated commit message: "${cleanCommitMessage}"`);

    const commitResult = await agent.executeBashCommand(`git commit -m "${cleanCommitMessage}"`);

    if (commitResult.success) {
      console.log(`✅ git commit: ${commitResult.output?.split("\n")[0] || "Commit successful"}`);

      let pushResult = await agent.executeBashCommand("git push");
      if (!pushResult.success && pushResult.error?.includes("no upstream branch")) {
        console.log("🔄 Setting upstream and pushing...");
        pushResult = await agent.executeBashCommand("git push -u origin HEAD");
      }

      if (pushResult.success) {
        console.log(`✅ git push: ${pushResult.output?.split("\n")[0] || "Push successful"}`);
      } else {
        console.log(`❌ git push: ${pushResult.error || "Push failed"}`);
        process.exit(1);
      }
    } else {
      console.log(`❌ git commit: ${commitResult.error || "Commit failed"}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error("❌ Error during commit and push:", error.message);
    process.exit(1);
  }
}

async function processPromptHeadless(
  prompt: string,
  apiKey: string,
  baseURL?: string,
  model?: string,
  maxToolRounds?: number,
  characterName?: string
): Promise<void> {
  try {
    const agent = new GrokAgent(apiKey, baseURL, model, maxToolRounds, characterName);

    const confirmationService = ConfirmationService.getInstance();
    confirmationService.setSessionFlag("allOperations", true);

    const chatEntries = await agent.processUserMessage(prompt);
    const messages: ChatCompletionMessageParam[] = [];

    for (const entry of chatEntries) {
      switch (entry.type) {
        case "user":
          messages.push({ role: "user", content: entry.content });
          break;

        case "assistant": {
          const assistantMessage: ChatCompletionMessageParam = {
            role: "assistant",
            content: entry.content,
          };
          if (entry.toolCalls && entry.toolCalls.length > 0) {
            assistantMessage.tool_calls = entry.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: "function",
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            }));
          }
          messages.push(assistantMessage);
          break;
        }

        case "tool_result":
          if (entry.toolCall) {
            messages.push({
              role: "tool",
              tool_call_id: entry.toolCall.id,
              content: entry.content,
            });
          }
          break;
      }
    }

    for (const message of messages) {
      console.log(JSON.stringify(message));
    }
  } catch (error: any) {
    console.log(JSON.stringify({ role: "assistant", content: `Error: ${error.message}` }));
    process.exit(1);
  }
}

program
  .name("clawd")
  .description(
    "🦞 Clawd Code CLI — operator interface for the OpenClawd Leviathan framework. Multi-provider AI · MCP · Solana · realtime voice · in-process Metaplex spawn/molt."
  )
  .version("1.3.0")
  .argument("[message...]", "Initial message to send to Clawd")
  .option("-d, --directory <dir>", "set working directory", process.cwd())
  .option("-k, --api-key <key>", "xAI API key (or set XAI_API_KEY / GROK_API_KEY env var)")
  .option("-u, --base-url <url>", "xAI API base URL (or set XAI_BASE_URL / GROK_BASE_URL env var)")
  .option("-m, --model <model>", "AI model to use (e.g., grok-code-fast-1, grok-4-latest)")
  .option("-p, --prompt <prompt>", "process a single prompt and exit (headless mode)")
  .option("-c, --character <name>", "load a character persona from characters/ (e.g. clawd, alice, warrenbuffet)")
  .option("--max-tool-rounds <rounds>", "maximum number of tool execution rounds (default: 400)", "400")
  .action(async (message, options) => {
    if (options.directory) {
      try {
        process.chdir(options.directory);
      } catch (error: any) {
        console.error(`Error changing directory to ${options.directory}:`, error.message);
        process.exit(1);
      }
    }

    try {
      const apiKey = options.apiKey || loadApiKey();
      const baseURL = options.baseUrl || loadBaseURL();
      const model = options.model || loadModel();
      const maxToolRounds = parseInt(options.maxToolRounds) || 400;
      const characterName: string | undefined = options.character;

      const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
      if (!apiKey && !hasOpenRouter) {
        console.error(
          '❌ Error: API key required. Set XAI_API_KEY (or GROK_API_KEY) or OPENROUTER_API_KEY, use --api-key, or set "apiKey" in ~/.clawd/user-settings.json'
        );
        process.exit(1);
      }

      if (options.apiKey || options.baseUrl) {
        await saveCommandLineSettings(options.apiKey, options.baseUrl);
      }

      // Headless mode: process prompt and exit
      if (options.prompt) {
        await processPromptHeadless(options.prompt, apiKey, baseURL, model, maxToolRounds, characterName);
        return;
      }

      // Interactive mode: launch UI
      const agent = new GrokAgent(apiKey, baseURL, model, maxToolRounds, characterName);
      if (characterName) {
        console.log(`🎭 Character: ${characterName}\n`);
      }
      console.log("🦞 Clawd Code CLI - Lobster-powered AI assistant for Solana...\n");

      ensureUserSettingsDirectory();

      const initialMessage = Array.isArray(message) ? message.join(" ") : message;
      render(React.createElement(ChatInterface, { agent, initialMessage }));
    } catch (error: any) {
      console.error("❌ Error initializing Clawd Code CLI:", error.message);
      process.exit(1);
    }
  });

// Git subcommand
const gitCommand = program.command("git").description("Git operations with AI assistance");

gitCommand
  .command("commit-and-push")
  .description("Generate AI commit message and push to remote")
  .option("-d, --directory <dir>", "set working directory", process.cwd())
  .option("-k, --api-key <key>", "xAI API key (or set XAI_API_KEY / GROK_API_KEY env var)")
  .option("-u, --base-url <url>", "xAI API base URL")
  .option("-m, --model <model>", "AI model to use")
  .option("--max-tool-rounds <rounds>", "maximum number of tool execution rounds (default: 400)", "400")
  .action(async (options) => {
    if (options.directory) {
      try {
        process.chdir(options.directory);
      } catch (error: any) {
        console.error(`Error changing directory to ${options.directory}:`, error.message);
        process.exit(1);
      }
    }

    try {
      const apiKey = options.apiKey || loadApiKey();
      const baseURL = options.baseUrl || loadBaseURL();
      const model = options.model || loadModel();
      const maxToolRounds = parseInt(options.maxToolRounds) || 400;

      if (!apiKey) {
        console.error("❌ Error: API key required. Set XAI_API_KEY (or GROK_API_KEY), use --api-key, or save to ~/.clawd/user-settings.json");
        process.exit(1);
      }

      if (options.apiKey || options.baseUrl) {
        await saveCommandLineSettings(options.apiKey, options.baseUrl);
      }

      await handleCommitAndPushHeadless(apiKey, baseURL, model, maxToolRounds);
    } catch (error: any) {
      console.error("❌ Error during git commit-and-push:", error.message);
      process.exit(1);
    }
  });

// MCP command
program.addCommand(createMCPCommand());

// Examples command
program.addCommand(createExamplesCommand());

// Agent registry + hub command
program.addCommand(createAgentCommand());

// Character persona command
program.addCommand(createCharacterCommand());

// OpenRouter convenience command
program.addCommand(createOpenRouterCommand());

// Repo / GitHub preview command
program.addCommand(createPreviewCommand());

// Cloud OS — service management, doctor, setup, paths, env
program.addCommand(createCloudCommand());

// Skills — ClawdHub skill catalog
program.addCommand(createSkillsCommand());

// Attestation — SAS on-chain attestations
program.addCommand(createAttestCommand());

// Node, Marketplace, Pay
program.addCommand(createNodeCommand());
program.addCommand(createMarketplaceCommand());
program.addCommand(createPayCommand());

program.parse();
