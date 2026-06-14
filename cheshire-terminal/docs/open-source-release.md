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
pnpm run audit:github-target -- owner/repo
```

`owner/repo` must be the public Cheshire Terminal repository. Do not use `Solizardking/solana-clawd` as the publish target; that repository is the upstream source for the imported skills and arena assets.

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

`pnpm run audit:open-source` scans the Git publish set. It intentionally skips gitignored local secret state such as `.env.local`, provider cache directories, wallet folders, and deployment metadata. Those files may remain on a workstation for local operation, but they are not part of the public repository and must not be included in zip uploads or manual file drops.

## GitHub Publish Flow

Set the public Cheshire Terminal repository as `origin` only after confirming the target:

```bash
git remote set-url origin https://github.com/<owner>/<cheshire-terminal-repo>.git
pnpm run audit:github-target -- <owner>/<cheshire-terminal-repo>
git push -u origin main
```

If you want to keep the Solana Clawd source repository nearby, add it as a non-push remote:

```bash
git remote add solana-clawd https://github.com/Solizardking/solana-clawd.git
git remote set-url --push solana-clawd DISABLED
```
