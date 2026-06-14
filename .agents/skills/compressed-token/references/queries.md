# Query balances, accounts, and history

Read compressed token state through the `Rpc` returned by `createRpc()`. These methods read on-chain compressed state via the indexer. Snippets assume an `rpc`, an `owner` public key, a `mint` public key, and `bn` from `@lightprotocol/stateless.js`.

## Accounts and balances for an owner

`getCompressedTokenAccountsByOwner(owner, { mint })` returns the individual compressed token accounts an owner holds for a mint. An owner may hold several accounts for the same mint, so sum `parsed.amount` (a BN) for the total balance.

```typescript
const accounts = await rpc.getCompressedTokenAccountsByOwner(owner, { mint });
const total = accounts.items.reduce((sum, a) => sum.add(a.parsed.amount), bn(0));
```

For aggregated balances per mint, call `getCompressedTokenBalancesByOwnerV2(owner)` and read `value.items`, where each item has `mint` and `balance`.

## History

For compression-related transaction signatures of a token owner, call `getCompressionSignaturesForTokenOwner(owner)`. Each returned item has `signature`, `slot`, and `blockTime`.

## Related queries

- A delegate's accounts (before revoking): see [approve-revoke.md](approve-revoke.md), which uses `getCompressedTokenAccountsByDelegate`.
- Selecting input accounts and fetching validity proofs when building instructions: see [transfer.md](transfer.md) and [compress-decompress.md](compress-decompress.md).

## Source

- [compressed-token-cookbook/wallet-integration/get-balances.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/wallet-integration/get-balances.ts)
- [compressed-token-cookbook/wallet-integration/get-transaction-history.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/wallet-integration/get-transaction-history.ts)
