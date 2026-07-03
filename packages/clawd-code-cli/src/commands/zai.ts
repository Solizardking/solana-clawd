import { Command } from "commander";
import chalk from "chalk";
import { getSettingsManager } from "../utils/settings-manager.js";

const ZAI_MODELS = [
  "zai/glm-5.2",
  "zai/glm-5.1",
  "zai/glm-5",
];

function normalizeZaiModel(model: string): string {
  return model.startsWith("zai/") ? model : `zai/${model}`;
}

export function createZaiCommand(): Command {
  const cmd = new Command("zai").description(
    "Configure Z.ai GLM models for the Clawd terminal",
  );

  cmd
    .command("setup")
    .description("Save ZAI_API_KEY, GLM-5.2, and Z.ai OpenAI-compatible defaults")
    .option("-k, --api-key <key>", "Z.ai API key")
    .option(
      "-u, --base-url <url>",
      "Z.ai OpenAI-compatible base URL",
      process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4/",
    )
    .option(
      "-m, --default-model <model>",
      "Default Z.ai model",
      process.env.ZAI_MODEL ? `zai/${process.env.ZAI_MODEL.replace(/^zai\//, "")}` : ZAI_MODELS[0],
    )
    .action((opts) => {
      const manager = getSettingsManager();

      if (opts.apiKey) {
        manager.setProviderConfig("zai", { apiKey: opts.apiKey });
      }
      if (opts.baseUrl) {
        manager.setProviderConfig("zai", { baseURL: opts.baseUrl });
      }

      const existing = new Set(manager.getAvailableModels());
      const merged = [...ZAI_MODELS.filter((m) => !existing.has(m)), ...manager.getAvailableModels()];
      manager.updateUserSetting("models", merged);

      const defaultModel = opts.defaultModel ? normalizeZaiModel(opts.defaultModel) : ZAI_MODELS[0];
      if (defaultModel) {
        manager.updateUserSetting("defaultModel", defaultModel);
      }

      console.log(chalk.cyan.bold("\n  Z.ai GLM Mode Ready\n"));
      console.log(`  ${chalk.bold("Base URL:")}       ${opts.baseUrl}`);
      console.log(`  ${chalk.bold("Default model:")} ${defaultModel}`);
      console.log(`  ${chalk.bold("API key:")}        ${opts.apiKey ? "saved to ~/.clawd/user-settings.json" : "read from ZAI_API_KEY at runtime"}`);
      console.log(`  ${chalk.bold("Web search:")}     enabled when prompts need current information (${process.env.ZAI_WEB_SEARCH === "false" ? "disabled by ZAI_WEB_SEARCH=false" : "search-prime"})`);
      console.log(`  ${chalk.bold("Models:")}`);
      for (const model of ZAI_MODELS) {
        console.log(`    - ${model}`);
      }
      console.log(`\n  Next: run ${chalk.green("clawd")} or switch with ${chalk.green("/models")}\n`);
    });

  return cmd;
}
