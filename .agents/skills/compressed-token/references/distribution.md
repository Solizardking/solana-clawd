# Token distribution and airdrops

Compressed tokens make airdrops cheap because recipient accounts are rent-free. A common flow is: create an SPL mint with an interface PDA, mint SPL tokens to a source account, then compress to many recipients in one or more transactions. Recipients receive compressed tokens directly in their wallets; no claim step is required.

Use the simple flow for small recipient lists and the batched flow for large ones. For claim-based distribution, hold tokens compressed and decompress on claim.

## Simple airdrop (single transaction)

Compress to several recipients in one `CompressedTokenProgram.compress()` instruction by passing arrays for `toAddress` and `amount`. One recipient costs ~120,000 CU; five cost ~170,000 CU.

```typescript
import { CompressedTokenProgram, createTokenPool, getTokenPoolInfos, selectTokenPoolInfo } from '@lightprotocol/compressed-token';
import { bn, buildAndSignTx, calculateComputeUnitPrice, createRpc, dedupeSigner, selectStateTreeInfo, sendAndConfirmTx } from '@lightprotocol/stateless.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js';

const rpc = createRpc(process.env.RPC_ENDPOINT);
const payer = PAYER_KEYPAIR;
const recipients = [/* PublicKey[] */];

// Setup: SPL mint + interface PDA + source ATA with tokens
const mint = await createMint(rpc, payer, payer.publicKey, null, 9);
await createTokenPool(rpc, payer, mint);
const source = await getOrCreateAssociatedTokenAccount(rpc, payer, mint, payer.publicKey);
await mintTo(rpc, payer, mint, source.address, payer.publicKey, 100_000_000_000);

// Select a state tree and an interface PDA
const treeInfo = selectStateTreeInfo(await rpc.getStateTreeInfos());
const poolInfo = selectTokenPoolInfo(await getTokenPoolInfos(rpc, mint));

const units = 120_000;
const amount = bn(333);
const microLamports = calculateComputeUnitPrice(20_000, units);

const compressIx = await CompressedTokenProgram.compress({
    payer: payer.publicKey,
    owner: payer.publicKey,
    source: source.address,
    toAddress: recipients,
    amount: recipients.map(() => amount),
    mint,
    outputStateTreeInfo: treeInfo,
    tokenPoolInfo: poolInfo,
});

// Use the ZK compression address lookup table to fit more recipients per tx
// https://www.zkcompression.com/developers/protocol-addresses-and-urls#lookup-tables
const lookupTableAddress = new PublicKey('qAJZMgnQJ8G6vA3WRcjD9Jan1wtKkaCFWLWskxJrR5V'); // devnet
const lookupTableAccount = (await rpc.getAddressLookupTable(lookupTableAddress)).value!;

const { blockhash } = await rpc.getLatestBlockhash();
const tx = buildAndSignTx(
    [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports }), compressIx],
    payer,
    blockhash,
    dedupeSigner(payer, [payer]),
    [lookupTableAccount],
);
await sendAndConfirmTx(rpc, tx);
```

## Batched airdrop (many recipients)

For thousands of recipients, build batches of instructions and send them with retry logic. The `createAirdropInstructions` helper chunks recipients: `maxRecipientsPerInstruction` defaults to 5 and `maxInstructionsPerTransaction` defaults to 3, so each transaction handles up to 15 recipients. It selects a fresh state tree and interface PDA per transaction and packs everything behind the address lookup table.

```typescript
import { CompressedTokenProgram, selectTokenPoolInfo, TokenPoolInfo } from '@lightprotocol/compressed-token';
import { bn, selectStateTreeInfo, StateTreeInfo } from '@lightprotocol/stateless.js';
import { ComputeBudgetProgram, PublicKey, TransactionInstruction } from '@solana/web3.js';

export type InstructionBatch = TransactionInstruction[];

export async function createAirdropInstructions({
    amount, recipients, payer, sourceTokenAccount, mint, treeInfos, tokenPoolInfos,
    maxRecipientsPerInstruction = 5,
    maxInstructionsPerTransaction = 3,
    computeUnitLimit = 500_000,
    computeUnitPrice = undefined,
}: {
    amount: number | bigint;
    recipients: PublicKey[];
    payer: PublicKey;
    sourceTokenAccount: PublicKey;
    mint: PublicKey;
    treeInfos: StateTreeInfo[];
    tokenPoolInfos: TokenPoolInfo[];
    maxRecipientsPerInstruction?: number;
    maxInstructionsPerTransaction?: number;
    computeUnitLimit?: number;
    computeUnitPrice?: number;
}): Promise<InstructionBatch[]> {
    const batches: InstructionBatch[] = [];
    const amountBn = bn(amount.toString());
    const perTx = maxRecipientsPerInstruction * maxInstructionsPerTransaction;

    for (let i = 0; i < recipients.length; i += perTx) {
        const instructions: TransactionInstruction[] = [
            ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
        ];
        if (computeUnitPrice) {
            instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeUnitPrice }));
        }
        const outputStateTreeInfo = selectStateTreeInfo(treeInfos);
        const tokenPoolInfo = selectTokenPoolInfo(tokenPoolInfos);

        for (let j = 0; j < maxInstructionsPerTransaction; j++) {
            const start = i + j * maxRecipientsPerInstruction;
            const batch = recipients.slice(start, start + maxRecipientsPerInstruction);
            if (batch.length === 0) break;
            const ix = await CompressedTokenProgram.compress({
                payer, owner: payer, source: sourceTokenAccount,
                toAddress: batch, amount: batch.map(() => amountBn),
                mint, outputStateTreeInfo, tokenPoolInfo,
            });
            instructions.push(ix);
        }
        batches.push(instructions);
    }
    return batches;
}
```

Sign and send each batch as a versioned transaction with the lookup table, retrying failures and refreshing the blockhash. See `sign-and-send.ts` in the example repo for a complete generator with retry handling.

## Decompress on claim

To gate distribution behind a claim, hold tokens compressed and let the claimer decompress to their SPL account. Select input accounts, fetch a validity proof, select interface PDA infos for decompression, then build the decompress instruction.

```typescript
import { CompressedTokenProgram, getTokenPoolInfos, selectMinCompressedTokenAccountsForTransfer, selectTokenPoolInfosForDecompression } from '@lightprotocol/compressed-token';
import { bn } from '@lightprotocol/stateless.js';

const accounts = await rpc.getCompressedTokenAccountsByOwner(owner.publicKey, { mint });
const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(accounts.items, bn(amount));
const proof = await rpc.getValidityProof(inputAccounts.map((a) => bn(a.compressedAccount.hash)));
const pools = selectTokenPoolInfosForDecompression(await getTokenPoolInfos(rpc, mint), amount);

const decompressIx = await CompressedTokenProgram.decompress({
    payer: payer.publicKey,
    inputCompressedTokenAccounts: inputAccounts,
    toAddress: destinationAta,
    amount,
    tokenPoolInfos: pools,
    recentInputStateRootIndices: proof.rootIndices,
    recentValidityProof: proof.compressedProof,
});
```

## Source

- [example-token-distribution/src/simple-airdrop](https://github.com/Lightprotocol/examples-zk-compression/tree/main/example-token-distribution/src/simple-airdrop)
- [example-token-distribution/src/optimized-airdrop](https://github.com/Lightprotocol/examples-zk-compression/tree/main/example-token-distribution/src/optimized-airdrop)
