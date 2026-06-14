# Compress and decompress SPL tokens

Use `compress()` to convert SPL tokens into compressed tokens and `decompress()` to convert them back. Both require an SPL mint with an interface PDA (from `createMint()` or `createTokenPool()`).

- `compress(amount, sourceTokenAccount, toAddress)` compresses a specific amount from a source SPL account to a chosen recipient. Use for transfers and precise amounts.
- `compressSplTokenAccount(tokenAccount, remainingAmount?)` compresses the entire SPL account balance (minus an optional remaining amount) to the same owner. Use to migrate complete token accounts and reclaim rent afterwards. See the full-account section below.

## Compress

```typescript
import { Keypair } from '@solana/web3.js';
import { createRpc } from '@lightprotocol/stateless.js';
import { createMint, compress } from '@lightprotocol/compressed-token';
import { getOrCreateAssociatedTokenAccount, mintTo as splMintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const rpc = createRpc();
const payer = Keypair.generate();

const { mint } = await createMint(rpc, payer, payer.publicKey, 9);
const owner = Keypair.generate();
const ata = await getOrCreateAssociatedTokenAccount(rpc, payer, mint, owner.publicKey, false, TOKEN_PROGRAM_ID);
await splMintTo(rpc, payer, mint, ata.address, payer, 1_000_000_000, [], undefined, TOKEN_PROGRAM_ID);

const compressTx = await compress(
    rpc,
    payer,
    mint,            // SPL mint with interface PDA
    400_000_000,     // amount
    owner,           // owner of SPL tokens
    ata.address,     // source SPL token account
    owner.publicKey, // recipient of compressed tokens
);
```

## Decompress

```typescript
import { decompress } from '@lightprotocol/compressed-token';

const decompressTx = await decompress(
    rpc,
    payer,
    mint,         // SPL mint with interface PDA
    300_000_000,  // amount
    owner,        // owner of compressed tokens
    ata.address,  // destination SPL token account
);
```

## Compress a complete SPL account and reclaim rent

`compressSplTokenAccount()` moves the entire balance into compressed form. After it succeeds, an empty SPL account can be closed to reclaim its rent.

```typescript
import { compressSplTokenAccount } from '@lightprotocol/compressed-token';
import { bn } from '@lightprotocol/stateless.js';

// Compress the full balance
await compressSplTokenAccount(rpc, payer, mint, owner, tokenAccount);

// Or keep some tokens in SPL form
await compressSplTokenAccount(rpc, payer, mint, owner, tokenAccount, bn(100_000_000));
```

## Instruction-level compress and decompress

When building instructions yourself, fetch and select interface PDA info.

```typescript
import { CompressedTokenProgram, getTokenPoolInfos, selectTokenPoolInfo, selectTokenPoolInfosForDecompression, selectMinCompressedTokenAccountsForTransfer } from '@lightprotocol/compressed-token';
import { selectStateTreeInfo, bn } from '@lightprotocol/stateless.js';

// Compress
const treeInfo = selectStateTreeInfo(await rpc.getStateTreeInfos());
const poolInfo = selectTokenPoolInfo(await getTokenPoolInfos(rpc, mint));

const compressIx = await CompressedTokenProgram.compress({
    payer: payer.publicKey,
    owner: owner.publicKey,
    source: ata.address,
    toAddress: owner.publicKey,
    amount: bn(1e5),
    mint,
    outputStateTreeInfo: treeInfo,
    tokenPoolInfo: poolInfo,
});

// Decompress
const accounts = await rpc.getCompressedTokenAccountsByOwner(owner.publicKey, { mint });
const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(accounts.items, bn(1e5));
const proof = await rpc.getValidityProof(inputAccounts.map((a) => a.compressedAccount.hash));
const decompressPools = selectTokenPoolInfosForDecompression(await getTokenPoolInfos(rpc, mint), 1e5);

const decompressIx = await CompressedTokenProgram.decompress({
    payer: payer.publicKey,
    inputCompressedTokenAccounts: inputAccounts,
    toAddress: ata.address,
    amount: 1e5,
    tokenPoolInfos: decompressPools,
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
});
```

## Troubleshooting

- **Insufficient balance** — check the compressed balance (sum of `getCompressedTokenAccountsByOwner`) before decompressing, and the SPL balance (`getTokenAccountBalance`) before compressing.
- **Invalid owner** — the owner signer must own the tokens being moved; the payer can be a different fee payer.

## Source

- [compressed-token-cookbook/actions/compress.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/compress.ts)
- [compressed-token-cookbook/actions/decompress.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/decompress.ts)
- [compressed-token-cookbook/actions/compress-spl-account.ts](https://github.com/Lightprotocol/examples-zk-compression/tree/main/compressed-token-cookbook/actions/compress-spl-account.ts)
