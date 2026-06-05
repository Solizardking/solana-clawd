import { Command } from "commander";
import chalk from "chalk";
import { listCharacters, loadCharacter, buildCharacterPrompt, resolveCharactersDir } from "../utils/character-loader.js";

export function createCharacterCommand(): Command {
  const character = new Command("character");
  character.description("Browse and load agent character personas");

  // clawd character list
  character
    .command("list")
    .description("List all available character personas")
    .option("-t, --type <type>", "filter by type: eliza | investor | solana-agent")
    .option("-s, --search <query>", "search by name or description")
    .action((opts) => {
      const all = listCharacters();
      let results = all;

      if (opts.type) {
        results = results.filter(c => c.type === opts.type);
      }
      if (opts.search) {
        const q = opts.search.toLowerCase();
        results = results.filter(
          c =>
            c.id.includes(q) ||
            c.displayName.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q)
        );
      }

      if (!results.length) {
        console.log(chalk.yellow("\n  No characters found.\n"));
        return;
      }

      const typeColor = (t: string) => {
        if (t === 'eliza') return chalk.magenta(t);
        if (t === 'investor') return chalk.yellow(t);
        return chalk.cyan(t);
      };

      console.log(chalk.bold.cyan(`\n  ${results.length} character(s) in ${resolveCharactersDir()}\n`));
      for (const c of results) {
        console.log(
          `  ${chalk.bold(c.displayName.padEnd(30))} ${typeColor(c.type.padEnd(12))} ${chalk.dim(c.id)}`
        );
        if (c.description) {
          console.log(`     ${chalk.dim(c.description.slice(0, 80))}`);
        }
      }
      console.log();
      console.log(chalk.dim('  Usage: clawd --character <name>   or   clawd --character <id>\n'));
    });

  // clawd character show <name>
  character
    .command("show <name>")
    .description("Show full details for a character persona")
    .action((name: string) => {
      const result = loadCharacter(name);
      if (!result) {
        console.log(chalk.red(`\n  Character "${name}" not found.\n`));
        console.log(chalk.dim('  Run: clawd character list\n'));
        return;
      }

      const { data, type } = result;
      const obj = data as Record<string, unknown>;
      const prompt = buildCharacterPrompt(data, type);

      console.log(chalk.bold.cyan(`\n  Character: ${obj.name ?? name}\n`));
      console.log(chalk.dim(`  Type: ${type}\n`));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(prompt);
      console.log(chalk.dim('─'.repeat(60)));
      console.log();
    });

  return character;
}
