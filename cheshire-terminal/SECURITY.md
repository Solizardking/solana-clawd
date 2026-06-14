# Security

## Reporting

Please report vulnerabilities privately to the repository maintainers. Include affected routes, reproduction steps, and any logs that do not contain secrets.

## Secret Handling

Never commit production secrets, API keys, wallet keypairs, OAuth client secret JSON, service account credentials, private keys, or real `.env` files.

Use deployment-managed environment variables for Convex, Fly, Vercel, database credentials, RPC keys, AI provider keys, and token-gated admin secrets.

Before publishing or opening a pull request, run:

```bash
pnpm run audit:open-source
```

The audit checks the public publish set for private file names, absolute local workstation paths, and common token formats. It prints only path and rule names.

## Wallet Safety

Do not store Solana private keys in the repository. Use local wallet tooling, environment variables outside git, or provider-managed secret stores. Documentation examples must use placeholders only.
