# Devnet addresses

## Program addresses

These addresses are identical on devnet and mainnet.

| Program              | Address                                        |
|----------------------|------------------------------------------------|
| Light System Program | `SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7` |
| Compressed Token     | `cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m`  |
| Account Compression  | `compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq` |
| Light Registry       | `7Z9Yuy3HkBCc2Wf3xEN9BEkqxY3hn2NLqBJm4HKDtT5c` |

## State tree lookup tables (devnet)

Fetch active trees at runtime:

```typescript
const { stateTrees } = await connection.getCachedActiveStateTreeInfo();
```

| Lookup Table                    | Address                                        |
|---------------------------------|------------------------------------------------|
| State Tree Lookup Table         | `DmRueT3LMJdGj3TEprqKtfwMxyNUHDnKrQua4xrqtbmG` |
| Address Tree Lookup Table       | `G4HqCAWPJ1E3JmYX1V2RZvNMuzF6gcFdbwT8FccWX6ru` |

## Batch address tree

```typescript
const BATCH_ADDRESS_TREE_ADDRESS = new PublicKey(
  "amt1Ayt45jfbdw5YSo7iz6WZxUmnZsQTYXy82hVwyC2"
);
```

## Usage notes

- Always fetch state trees dynamically using `getCachedActiveStateTreeInfo()`
- Do not hardcode tree addresses; they rotate as trees fill up
- Lookup table addresses are stable and can be referenced directly
