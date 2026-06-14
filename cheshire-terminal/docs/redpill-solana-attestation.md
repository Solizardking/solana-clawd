# RedPill TEE to Solana Attestation Launch

This app can bind a RedPill TEE completion to an on-chain Solana Attestation Service (SAS) record.

The raw prompt, response, RedPill signature body, and attestation report are not written on-chain. The SAS attestation stores deterministic hashes plus the RedPill signing address so the full evidence bundle can be verified off-chain.

## Defaults

- RedPill API base: `https://api.redpill.ai/v1`
- Primary TEE model: `REDPILL_MODEL=deepseek/deepseek-v4-flash`
- Secondary TEE model: `REDPILL_MODEL2=google/gemma-4-31b-it`
- SAS program: `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`
- SAS schema: `RedPillTeeEvidence`

## Required Env

```bash
REDPILL_API_KEY=...
REDPILL_MODEL=deepseek/deepseek-v4-flash
REDPILL_MODEL2=google/gemma-4-31b-it

SAS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
SAS_CREDENTIAL_NAME="Cheshire RedPill TEE"
SAS_ADMIN_SECRET=...
SAS_PAYER_SECRET_KEY=...
SAS_AUTHORITY_SECRET_KEY=...
```

`SAS_PAYER_SECRET_KEY` pays rent and transaction fees. `SAS_AUTHORITY_SECRET_KEY` owns the SAS credential and is authorized to issue attestations. If either is missing, the server can fall back to the existing platform fee-payer envs, but production should use dedicated SAS keys.

`SAS_ADMIN_SECRET` protects endpoints that can spend RedPill credits or submit Solana transactions. If it is not set, the server falls back to `ADMIN_SECRET`. Send it as `x-sas-admin-secret` or `x-admin-secret`.

## Mainnet Readiness Check

This check reads config, signer addresses, payer balance, SAS program state, and derived credential/schema accounts. It does not call RedPill and does not submit any Solana transaction.

```bash
npm run check:redpill:sas
```

The launch is ready when the output shows:

```text
redpillConfigured: true
sasSignerConfigured: true
adminWriteGuardConfigured: true
program.executable: true
payer.funded: true
readyForSetup: true
```

## Mainnet Launch Command

Dry-run the mainnet launcher. This reads RPC/account state only:

```bash
npm run launch:redpill:sas:mainnet
```

Create the mainnet SAS credential and schema after the payer is funded:

```bash
npm run launch:redpill:sas:mainnet -- --confirm-mainnet --setup-only
```

Issue a sample RedPill-backed mainnet attestation:

```bash
npm run launch:redpill:sas:mainnet -- --confirm-mainnet --attest
```

The launcher refuses to submit if:

```text
RPC genesis hash is not mainnet-beta
REDPILL_API_KEY is missing
SAS payer/authority keys are missing
SAS program is not executable
SAS payer has less than the configured minimum SOL
```

## Verify An Attestation

Verify a SAS attestation PDA after launch:

```bash
npm run verify:redpill:sas -- --attestation <ATTESTATION_PDA>
```

The verifier reads the attestation account, verifies it is owned by the SAS program, follows the linked credential and schema accounts, confirms the attestation signer is authorized by the credential, checks the schema matches `RedPillTeeEvidence`, and deserializes the RedPill evidence payload.

You can pin expected evidence values:

```bash
npm run verify:redpill:sas -- \
  --attestation <ATTESTATION_PDA> \
  --model deepseek/deepseek-v4-flash \
  --request-id <REDPILL_REQUEST_ID> \
  --evidence-hash <EXPECTED_EVIDENCE_HASH>
```

Verify the existing devnet proof:

```bash
npm run verify:redpill:sas -- \
  --rpc https://api.devnet.solana.com \
  --attestation 8bMbdJTRq7NyEiawMB5PMr49coBx9H37YXGapypxwPrQ \
  --model deepseek/deepseek-v4-flash \
  --request-id 03a3d8eec9b24722945aaeedc7623446 \
  --evidence-hash ac44c0993739adc73b0ee968abee36385aca4239cdad15205823697440900639
```

## Endpoints

Check readiness:

```bash
curl https://cheshireterminal.ai/api/tee/attestation/config
```

Create the SAS credential and schema idempotently:

```bash
curl -X POST https://cheshireterminal.ai/api/tee/attestation/setup \
  -H "Content-Type: application/json" \
  -H "x-sas-admin-secret: $SAS_ADMIN_SECRET"
```

Run RedPill chat, fetch RedPill request proof, and issue a SAS attestation:

```bash
curl -X POST https://cheshireterminal.ai/api/tee/attestation/chat \
  -H "Content-Type: application/json" \
  -H "x-sas-admin-secret: $SAS_ADMIN_SECRET" \
  -d '{
    "messages": [
      { "role": "user", "content": "What is the meaning of life?" }
    ],
    "model": "deepseek/deepseek-v4-flash"
  }'
```

Prepare hashes without submitting on-chain:

```bash
curl -X POST https://cheshireterminal.ai/api/tee/attestation/chat \
  -H "Content-Type: application/json" \
  -H "x-sas-admin-secret: $SAS_ADMIN_SECRET" \
  -d '{
    "submit": false,
    "messages": [
      { "role": "user", "content": "What is the meaning of life?" }
    ]
  }'
```

## On-Chain Data

Schema layout bytes:

```text
[12, 12, 12, 12, 12, 12, 8, 10]
```

Fields:

```text
request_id: string
model: string
signing_address: string
request_hash: string
response_hash: string
evidence_hash: string
issued_at: i64
provider_attested: bool
```

`provider_attested=true` means the server fetched both RedPill `/v1/signature/{request_id}` and `/v1/attestation/report` and bound them into the hash. Full cryptographic verification of the RedPill quote/signature remains an off-chain verifier step.

## Devnet Launch Proof

Last verified: June 12, 2026.

Command:

```bash
npm run attest:redpill:devnet
```

Receipts:

```text
network: devnet
credential_pda: BXVb29k8hRxDasxo8LfvMvq1TQW7o67gzntoBSa7kLjG
schema_pda: 8E9soKCb3z3wHBb8DveaijURiPfZbAhfr3LxXjBaM3Cx
attestation_pda: 8bMbdJTRq7NyEiawMB5PMr49coBx9H37YXGapypxwPrQ
attestation_tx: 4MPcv6krXTDVjRPFqYjv3mTVochPZtYcoiDGc29ZWqac6VrCaDqChHpXF3UN2M3z2rbJSUBbS4vKTkibPTGgbZDv
request_id: 03a3d8eec9b24722945aaeedc7623446
model: deepseek/deepseek-v4-flash
evidence_hash: ac44c0993739adc73b0ee968abee36385aca4239cdad15205823697440900639
provider_attested: true
```

Verification evidence from devnet:

```text
attestation_owner: 22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG
decoded_model: deepseek/deepseek-v4-flash
decoded_evidence_hash: ac44c0993739adc73b0ee968abee36385aca4239cdad15205823697440900639
decoded_provider_attested: true
```

Explorer:

```text
https://explorer.solana.com/tx/4MPcv6krXTDVjRPFqYjv3mTVochPZtYcoiDGc29ZWqac6VrCaDqChHpXF3UN2M3z2rbJSUBbS4vKTkibPTGgbZDv?cluster=devnet
```
