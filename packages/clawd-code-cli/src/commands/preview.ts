import { Command } from "commander";
import chalk from "chalk";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function createPreviewCommand(): Command {
  const cmd = new Command("preview").description(
    "Preview the current repo and live surfaces before sharing",
  );

  cmd
    .command("repo")
    .description("Show a live preview of the current checkout and GitHub remote")
    .option("-d, --directory <dir>", "repo directory", process.cwd())
    .action((opts) => {
      const cwd = path.resolve(opts.directory);
      const remote = git(["config", "--get", "remote.origin.url"], cwd);
      const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      const status = git(["status", "--short"], cwd);
      const commits = git(["log", "--oneline", "-3"], cwd)
        .split("\n")
        .filter(Boolean);

      const readmePath = path.join(cwd, "README.md");
      const packageJsonPath = path.join(cwd, "package.json");
      const readmePreview = existsSync(readmePath)
        ? readFileSync(readmePath, "utf8").split("\n").slice(0, 12).join("\n")
        : "(no README.md found)";
      const packageScripts = existsSync(packageJsonPath)
        ? Object.keys(JSON.parse(readFileSync(packageJsonPath, "utf8")).scripts || {})
        : [];

      console.log(chalk.cyan.bold("\n  Repo Preview\n"));
      console.log(`  ${chalk.bold("Directory:")} ${cwd}`);
      console.log(`  ${chalk.bold("Remote:")}    ${remote || "(no origin remote)"}`);
      console.log(`  ${chalk.bold("Branch:")}    ${branch}`);
      console.log(`  ${chalk.bold("Status:")}    ${status ? `${status.split("\n").length} changed path(s)` : "clean"}`);
      console.log(`\n  ${chalk.bold("Recent commits:")}`);
      for (const commit of commits) {
        console.log(`    - ${commit}`);
      }
      console.log(`\n  ${chalk.bold("Dev scripts:")} ${packageScripts.join(", ") || "(none)"}`);
      console.log(`\n  ${chalk.bold("README preview:")}`);
      console.log(readmePreview);
      console.log("");
    });

  return cmd;
}
