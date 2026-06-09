import { Command } from "commander";
import chalk from "chalk";
import { getSettingsManager } from "../utils/settings-manager.js";

const FREE_OPENROUTER_MODELS = [
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/nvidia/nemotron-3.5-content-safety:free",
  "openrouter/openrouter/optimus-alpha:free",
];

export function createOpenRouterCommand(): Command {
  const cmd = new Command("openrouter").description(
    "Configure OpenRouter models for the Clawd terminal",
  );

  cmd
    .command("setup-free")
    .description("Bake in OPENROUTER_API_KEY and free OpenRouter models")
    .option("-k, --api-key <key>", "OpenRouter API key")
    .option(
      "-u, --base-url <url>",
      "OpenRouter-compatible base URL",
      process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    )
    .option(
      "-m, --default-model <model>",
      "Default free model",
      FREE_OPENROUTER_MODELS[0],
    )
    .action((opts) => {
      const manager = getSettingsManager();

      if (opts.apiKey) {
        manager.setProviderConfig("openrouter", { apiKey: opts.apiKey });
      }
      if (opts.baseUrl) {
        manager.setProviderConfig("openrouter", { baseURL: opts.baseUrl });
      }

      const existing = new Set(manager.getAvailableModels());
      const merged = [...FREE_OPENROUTER_MODELS.filter((m) => !existing.has(m)), ...manager.getAvailableModels()];
      manager.updateUserSetting("models", merged);

      if (opts.defaultModel) {
        manager.updateUserSetting("defaultModel", opts.defaultModel);
      }

      console.log(chalk.cyan.bold("\n  OpenRouter Free Mode Ready\n"));
      console.log(`  ${chalk.bold("Base URL:")}       ${opts.baseUrl}`);
      console.log(`  ${chalk.bold("Default model:")} ${opts.defaultModel}`);
      console.log(`  ${chalk.bold("API key:")}        ${opts.apiKey ? "saved to ~/.clawd/user-settings.json" : "read from OPENROUTER_API_KEY at runtime"}`);
      console.log(`  ${chalk.bold("Free models:")}`);
      for (const model of FREE_OPENROUTER_MODELS) {
        console.log(`    - ${model}`);
      }
      console.log(`\n  Next: run ${chalk.green("clawd")} or switch with ${chalk.green("/models")}\n`);
    });

  return cmd;
}
