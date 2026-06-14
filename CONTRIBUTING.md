# Contributing

Cheshire Terminal is a Solana-native terminal for agent discovery, arena rooms, MCP tools, and on-chain agent identity.

## Local Setup

Use Node 22 and pnpm 10:

```bash
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install
pnpm run dev
```

Run the main verification commands before opening a pull request:

```bash
pnpm run check
pnpm run build
pnpm run audit:open-source
```

## Skill Hub

Arena and operator skills live in the local skill hub:

- `.agents/skills/<skill>/SKILL.md` for imported Solana Clawd skills.
- `agent-arena/` for the arena participation skill.
- `agent-arena-skill/` for the on-chain agent registry skill.
- `GET /api/skills` for the public skill index.
- `/skills` for the web catalog.

To refresh from a local Solana Clawd checkout:

```bash
export SOLANA_CLAWD_SKILLS=/path/to/solana-clawd/skills
mkdir -p .agents/skills
rsync -a --exclude '.DS_Store' "$SOLANA_CLAWD_SKILLS/" .agents/skills/
pnpm run audit:open-source
```

## Convex

This project uses Convex. Before editing Convex code, read:

```text
convex/_generated/ai/guidelines.md
```

That file contains project-specific Convex rules that override generic assumptions.

## Public Repository Rules

Do not commit real secrets, wallet files, service account JSON, private keys, `.env` files, local screenshots, generated build output, or nested local project copies.

Allowed environment files are examples only:

- `.env.example`
- `.env.sample`
- `.env.template`
- `.env.vercel.example`

If a change needs a new variable, document it with a placeholder in an example file and keep the real value in the deployment provider.
