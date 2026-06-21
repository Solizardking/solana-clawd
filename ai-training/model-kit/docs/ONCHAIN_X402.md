# onchain.x402.wtf Integration

`onchain.x402.wtf` is the public registry and product surface for Solana Clawd
AI models. The local model kit produces the dataset, adapter, manifest, and
dry-run payloads that the registry consumes.

## Links

- Model kit site: https://models.x402.wtf
- Register page: https://register.x402.wtf
- Registry: https://onchain.x402.wtf
- Well-known manifest: https://onchain.x402.wtf/.well-known/clawd-registry.json
- Model API: https://onchain.x402.wtf/api/models
- Register API: https://onchain.x402.wtf/api/register
- Source handoff: `ai-training/onchain.md`

## Web Register

`register.x402.wtf` uses the same CAAP/1.0 payload contract as
`ai-training/dao/register_model.sh`.

The page talks to the model-kit Render API:

```text
POST /api/register/preview
POST /api/register
```

`/api/register` remains a dry-run unless the request includes `live: true`.
Live requests require a real `model_hash` unless `allow_generated_hash: true`
is deliberately supplied for a provisional entry.

## Dry-Run

```bash
ai-training/model-kit/bin/clawd-model-kit register \
  --hf-model solanaclawd/my-solana-lora \
  --manifest data/model_kit/model_kit_manifest.json
```

## Live Off-Chain Register

```bash
ai-training/model-kit/bin/clawd-model-kit register \
  --hf-model solanaclawd/my-solana-lora \
  --manifest data/model_kit/model_kit_manifest.json \
  --endpoint https://your-router.example/v1 \
  --eval-accuracy 0.72 \
  --live \
  --yes
```

## Onchain Register

Onchain writes are separate from the off-chain index and require a funded,
isolated keypair:

```bash
ai-training/model-kit/bin/clawd-model-kit register \
  --hf-model solanaclawd/my-solana-lora \
  --manifest data/model_kit/model_kit_manifest.json \
  --onchain \
  --live \
  --yes
```

Model registration is not permission to trade. Trading remains behind wallet
isolation, explicit approval, simulation, and Vulcan/Rise risk checks.
