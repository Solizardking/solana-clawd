# Token-2022 with compression

Compressed tokens support Token-2022 mints. Create the Token-2022 mint with its extensions, register an interface PDA with `createTokenPool()` (passing `TOKEN_2022_PROGRAM_ID`), then mint, compress, and transfer as usual.

## Supported mint extensions

- MetadataPointer
- TokenMetadata
- InterestBearingConfig
- GroupPointer
- GroupMemberPointer
- TokenGroup
- TokenGroupMember

Other extensions are not yet supported.

## Required SDK versions

- `@lightprotocol/stateless.js` >= 0.23.0
- `@lightprotocol/compressed-token` >= 0.23.0
- `@solana/web3.js` >= 1.95.3

## Create a Token-2022 mint with metadata and register it

```typescript
import { createRpc } from '@lightprotocol/stateless.js';
import { createTokenPool } from '@lightprotocol/compressed-token';
import {
    TOKEN_2022_PROGRAM_ID,
    createInitializeMetadataPointerInstruction,
    createInitializeMintInstruction,
    ExtensionType,
    getMintLen,
    LENGTH_SIZE,
    TYPE_SIZE,
} from '@solana/spl-token';
import { createInitializeInstruction, pack, TokenMetadata } from '@solana/spl-token-metadata';
import { Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

const rpc = createRpc();
const payer = Keypair.generate();
const mint = Keypair.generate();
const decimals = 9;

const metadata: TokenMetadata = {
    mint: mint.publicKey,
    name: 'Example Token',
    symbol: 'EXMPL',
    uri: 'https://example.com/token-metadata.json',
    additionalMetadata: [['key', 'value']],
};

const mintLen = getMintLen([ExtensionType.MetadataPointer]);
const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
const mintLamports = await rpc.getMinimumBalanceForRentExemption(mintLen + metadataLen);

const tx = new Transaction().add(
    SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports: mintLamports,
        programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(mint.publicKey, payer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, decimals, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        mint: mint.publicKey,
        metadata: mint.publicKey,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        mintAuthority: payer.publicKey,
        updateAuthority: payer.publicKey,
    }),
);
await sendAndConfirmTransaction(rpc, tx, [payer, mint]);

// Register the Token-2022 mint for compression
await createTokenPool(rpc, payer, mint.publicKey, undefined, TOKEN_2022_PROGRAM_ID);
```

## Mint, compress, and transfer

Mint SPL tokens to an ATA with `TOKEN_2022_PROGRAM_ID`, then use the standard `compress()` and `transfer()` functions.

```typescript
import { compress, transfer } from '@lightprotocol/compressed-token';
import { getOrCreateAssociatedTokenAccount, mintTo as splMintTo, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Keypair } from '@solana/web3.js';

const ata = await getOrCreateAssociatedTokenAccount(
    rpc, payer, mint.publicKey, payer.publicKey, undefined, undefined, undefined, TOKEN_2022_PROGRAM_ID,
);
await splMintTo(rpc, payer, mint.publicKey, ata.address, payer.publicKey, 400_000_000, undefined, undefined, TOKEN_2022_PROGRAM_ID);

await compress(rpc, payer, mint.publicKey, 300_000_000, payer, ata.address, payer.publicKey);

const recipient = Keypair.generate();
await transfer(rpc, payer, mint.publicKey, 100_000_000, payer, recipient.publicKey);
```

## Source

- December docs guide: Use Token-2022 with Compression
- [examples-zk-compression](https://github.com/Lightprotocol/examples-zk-compression)
