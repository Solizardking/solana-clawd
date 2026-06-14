# Open Source Release Checklist

Use this checklist before publishing Cheshire Terminal to GitHub or cutting a public snapshot.

## Publish Surface

The public repo should include:

- App source: `client/`, `server/`, `shared/`, `convex/`, `registry/`, `scripts/`, `workers/`, `apps/`, `packages/`, `drizzle/`, and `migrations/`.
- Arena assets: `arena/`, `agent-arena/`, and `agent-arena-skill/`.
- Skill hub: `.agents/skills/`.
- Public configuration examples: `.env.example` and `.env.vercel.example`.
- Documentation: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `docs/`.

The public repo should not include:

- Real `.env` files.
- Wallets, keypairs, service account JSON, OAuth client secrets, PEM files, or provider tokens.
- Generated build output such as `dist/`, `.next/`, `coverage/`, and `target/`.
- Local deployment state such as `.vercel/`, `.convex/`, `.clawd/`, and `.playwright-mcp/`.
- Nested local project copies and scratch research drops.
- Root-level screenshots, console logs, and one-off local notes.

## Required Checks

```bash
pnpm run check
pnpm run build
pnpm run audit:open-source
```

## Skill Catalog

The imported Solana Clawd skill catalog is served from `.agents/skills`.

Expected counts for this snapshot:

- `136` upstream Solana Clawd skills.
- `138` local `.agents/skills` entries, including the extra Cheshire-local `hf-cli` and `magicblock` skills.
- `140` total API skills when `agent-arena/` and `agent-arena-skill/` are included.

The API is:

```text
GET /api/skills
GET /api/skills/:slug
```

The web page is:

```text
/skills
```

## Deployment Notes

- Convex production is managed through Convex deploys.
- Fly serves the Express API and must copy `.agents/skills`, `agent-arena/`, and `agent-arena-skill/` into the runtime image.
- Vercel serves the public web deployment and should use deployment-managed environment variables only.

Do not publish by dragging the whole folder into GitHub. Initialize git from this directory, respect `.gitignore`, run the audit, then review `git status --ignored` before the first commit.
