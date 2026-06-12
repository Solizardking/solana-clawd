# Security Notes

This repository is public-facing. Do not commit private keys, wallet keypairs, seed phrases, API keys, production `.env` files, or provider credentials.

## Current Audit Snapshot

Last local audit: 2026-06-12 on branch `newnew`.

- Git history filename scan found no committed `.env`, `.pem`, `.key`, `id_rsa`, `id_ed25519`, or `*keypair*.json` paths.
- Tracked environment files are examples only, such as `.env.example` and package-level `.env.example` files.
- Local live env files are ignored by `.gitignore`, including `.env`, `.env.local`, `.env.*`, and service-level `.env` files.
- A local Solana deploy keypair exists under `programs/programs/target/`, which is ignored as build output.
- No installed `gitleaks` or `trufflehog` binary was available during this pass, so the audit used local Git and text-pattern scans.
- `npm run audit:repo` now runs the repeatable local audit used for tracked filenames, suspicious content patterns, package surfaces, and `install.sh` executability.

## Before Publishing

Run a dedicated scanner before pushing or tagging a release:

```bash
npm run audit:repo
gitleaks detect --source . --no-git --redact
gitleaks detect --source . --redact
```

If a real secret is found in history, rotate the secret first, then rewrite history with an approved tool such as `git filter-repo` or BFG and force-push only after coordinating with every clone owner.
