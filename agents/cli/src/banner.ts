export function printBanner(): void {
  console.error(`
 ██████╗██╗      █████╗ ██╗    ██╗██████╗
██╔════╝██║     ██╔══██╗██║    ██║██╔══██╗
██║     ██║     ███████║██║ █╗ ██║██║  ██║
██║     ██║     ██╔══██║██║███╗██║██║  ██║
╚██████╗███████╗██║  ██║╚███╔███╔╝██████╔╝
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═════╝
  █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗
 ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝
 ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗
 ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║
 ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║
 ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝

  Solana Agents CLI — build, deploy, and publish on-chain agents
`);
}

export function printSection(title: string): void {
  const width = 50;
  const line = "─".repeat(width);
  console.error(`\n ${title}`);
  console.error(` ${line}`);
}

export function printOk(msg: string): void {
  console.error(`  ✓ ${msg}`);
}

export function printInfo(msg: string): void {
  console.error(`  ▸ ${msg}`);
}

export function printWarn(msg: string): void {
  console.error(`  ⚠ ${msg}`);
}

export function printDone(msg: string): void {
  console.error(`\n  Done. ${msg}\n`);
}
