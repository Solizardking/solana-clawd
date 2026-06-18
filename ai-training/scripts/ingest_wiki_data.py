#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "huggingface_hub>=1.19.0",
#   "requests>=2.32.0",
# ]
# ///
"""
Ingest clawd-autoresearch-wiki training data into the Solana Clawd dataset.

Pulls three sources from https://github.com/Solizardking/clawd-autoresearch-wiki:
  1. solana-chat/solana/dataset.py  — 18 curated SFT pairs
  2. solana-chat/solana/tasks.py    — 18 MCQ eval tasks (for benchmark only)
  3. memory/honcho.py               — Honcho memory module (copied locally)

Then appends the new SFT pairs to data/solana_clawd_seed.jsonl and optionally
re-pushes the merged dataset to HF Hub.

Usage:
  python3 scripts/ingest_wiki_data.py
  python3 scripts/ingest_wiki_data.py --push --repo solanaclawd/solana-clawd-instruct
  python3 scripts/ingest_wiki_data.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
SEED_FILE = DATA_DIR / "solana_clawd_seed.jsonl"
WIKI_BASE = "https://raw.githubusercontent.com/Solizardking/clawd-autoresearch-wiki/main"

SYSTEM_PROMPT = (
    "You are Clawd, a sovereign Solana-native AI agent. "
    "You reason clearly about on-chain mechanics, DeFi strategies, memecoin risk, "
    "and agent architecture. You are helpful, honest, and never recommend actions "
    "that would harm users. You speak with the calm confidence of a veteran degen "
    "who has seen every rug and survived."
)

# 18 SFT Q&A pairs from solana-chat/solana/dataset.py — embedded here so this
# script works without cloning the wiki repo. Keep in sync with upstream.
WIKI_SFT_PAIRS: list[tuple[str, str]] = [
    (
        "What is a PDA on Solana?",
        "A Program Derived Address (PDA) is an address deterministically derived from a program ID and a set of seeds (a 'bump' seed ensures it's off the ed25519 curve). Unlike regular wallets, PDAs have no corresponding private key — only the program that derived them can sign on their behalf via `invoke_signed`. This makes them perfect for program-owned escrows, vaults, and AMM pool accounts. PDAs are the backbone of Solana's account model: every token account, every AMM pool, every lending reserve lives at a PDA.",
    ),
    (
        "Explain rent and rent-exemption on Solana.",
        "Rent is a fee paid per epoch for storing data onchain. An account is 'rent-exempt' if its balance covers 2 years of rent — in that case, rent is never actually collected. The minimum rent-exempt balance is calculated as `(128 + data_size) * lamports_per_byte_year * 2`. This mechanism prevents state bloat: if an account drops below the threshold, the network can garbage-collect it. For compressed accounts via Light Protocol, the effective rent cost drops by ~160x since the state lives in a Merkle tree with only a 32-byte root stored onchain.",
    ),
    (
        "What are compute units and how do they relate to priority fees?",
        "Each Solana transaction has a compute budget — default 200K compute units (CUs), extendable to 1.4M via `ComputeBudgetProgram`. Every instruction consumes CUs: a simple transfer ~150, a swap ~50K, a CPI-heavy liquidation ~500K+. Priority fees are additional tip per CU (in micro-lamports) that signal to validators: 'please include my tx'. With Jito tipping, you can pay a separate bribe to the block engine. The formula: total fee = base_fee + (compute_units * priority_fee_per_cu). During congestion, priority fees of 10M+ lamports are common for landing time-sensitive trades.",
    ),
    (
        "What is SPL Token-2022 and what new features does it bring?",
        "Token-2022 (also called Token Extensions) is the next-gen SPL Token standard that adds: (1) confidential transfers — amounts encrypted with ZK; (2) transfer hooks — custom logic runs on every transfer via CPI; (3) permanent delegate — a global authority override; (4) metadata pointer — inline metadata without external metadata programs; (5) interest-bearing tokens — token value accrues automatically. Token-2022 is backward-compatible: existing SPL Token infrastructure works, but you need updated SDKs for the new features.",
    ),
    (
        "How does cross-program invocation (CPI) work?",
        "CPI (Cross-Program Invocation) is how one Solana program calls another. The caller uses `invoke()` or `invoke_signed()` from solana_program, passing the target instruction and all required accounts. The key constraint is the account list: every account that the callee reads or writes must be passed explicitly, and the caller must already have signed for it or the PDA must sign via invoke_signed. CPI depth is limited to 4 levels. The pattern is heavily used in DeFi: a router program calls a DEX program via CPI to execute a swap on behalf of a user.",
    ),
    (
        "What are SPL tokens and Token Accounts?",
        "SPL tokens are Solana's native asset standard, analogous to ERC-20 on Ethereum. Each token type (mint) is identified by a mint address. User balances are stored in Associated Token Accounts (ATAs) — PDAs derived from the wallet address and mint address. The ATA standard ensures each wallet can have at most one standard account per token type, preventing confusion. To transfer tokens, the owner signs and the SPL Token program debits the source ATA and credits the destination ATA. Token amounts have configurable decimals (e.g., USDC has 6, SOL is native with 9).",
    ),
    (
        "Explain how Anchor simplifies Solana development.",
        "Anchor is a framework for writing Solana programs (smart contracts) in Rust. It provides: (1) a derive macro `#[derive(Accounts)]` that automatically validates and deserializes accounts; (2) `#[instruction]` for structured instruction data; (3) type-safe account constraints like `has_one`, `seeds`, and `signer`; (4) a CLI for building, testing, and deploying; (5) TypeScript SDK generation for frontend integration. Anchor eliminates boilerplate — a minimal token vault in Anchor is ~50 lines vs ~200 in raw solana_program. It is the de facto standard for Solana DeFi development.",
    ),
    (
        "How do pump.fun bonding curves work?",
        "pump.fun uses a constant-product bonding curve: `x * y = k` where x is SOL reserve and y is token supply. The curve starts at a virtual reserve (e.g., 33 SOL and 1B tokens) so the first buyer gets a finite price (~$0.000000033 per token). As buying pressure increases, the price follows the curve upward. The curve has no fees besides a small protocol fee. Once market cap hits ~$69K (about 85 SOL in the curve), a Raydium pool is automatically created — the curve's SOL and tokens are deposited as initial liquidity, and trading continues on the CLMM. The bonding curve ensures fair-ish launches: everyone trades against the same algorithm, not a team-controlled pool.",
    ),
    (
        "What's the difference between maker and taker fees on Phoenix/Drift?",
        "Maker fees are paid by orders that add liquidity to the orderbook (limit orders that don't immediately fill). Taker fees are paid by orders that remove liquidity (market orders or immediately-filling limit orders). On Phoenix DEX, maker fees are typically 0 bps (zero) and taker fees are ~3-5 bps. On Drift, maker fees are ~1 bps and taker ~4 bps. Some protocols offer fee discounts for holding their governance token (e.g., holding DRIFT reduces fees by up to 40%). Post-fee rebates, professional market makers often trade at negative net fees. Funding payments are separate from trading fees.",
    ),
    (
        "How do liquidation mechanics work in Solana perp protocols?",
        "In perp protocols like Phoenix and Drift, a position is liquidated when its margin ratio falls below a maintenance threshold (typically 5-10%) due to adverse price movement, funding costs, or both. When this happens, a liquidator can forcibly close the position, receiving a bonus (~5-7.5% of the position size) from the insolvent trader's collateral. Liquidation is permissionless — anyone running a liquidation bot can claim the bonus. The liquidation price depends on leverage and entry price: for a 5x long entry at $100, liquidation is around $82 (assuming 90% maintenance margin fraction). During high volatility, cascading liquidations can create 'liquidation cascades' that exacerbate price moves.",
    ),
    (
        "What should I check before aping into a new Solana token?",
        "Before aping, run through this rug-check checklist: (1) Does the mint authority exist? If not burned, the deployer can mint infinite tokens. (2) Is freeze authority present? If yes, your tokens can be frozen. (3) Check top 10 holder concentration — if >50% is held by one address, it's a slow rug waiting to happen. (4) Check liquidity pool lock — who deposited LP tokens and are they locked? Unlocked LP = potential rug. (5) Socials and GitHub: does the project have real docs, a non-copied website, and commit history? (6) Check if the token uses Arweave metadata or just JSON on IPFS. (7) Use Birdeye or DexScreener to check volume distribution — wash trading shows as repeated equal-size trades.",
    ),
    (
        "How do you detect a honeypot token?",
        "A honeypot token is one you can buy but can't sell. Signs: (1) The sell function in the token program has a `tax` parameter that's set to 100% in certain conditions. (2) Use a simulation tool (like Jupiter's quote API) to simulate both buy and sell — if the sell simulation fails or returns zero output, it's a honeypot. (3) Check if there's a `blacklist` or `excludeFromFee` mapping in the program — the deployer might have whitelisted their own address to bypass fees. (4) A telltale sign: the token trades actively with large buys, but zero sell volume on DexScreener. (5) On newly launched tokens, make a tiny 'test sell' before committing meaningful capital.",
    ),
    (
        "What is the brain/hands split in Clawd agent architecture?",
        "The brain/hands split is a security pattern where the LLM 'brain' produces analyses, trade plans, and intent (but never has access to a private key), while a separate 'hands' component — a lightweight deterministic agent with the actual keypair — executes under hard limits. The brain is the Qwen/Hermes-3 model that reasons about Solana mechanics, risk, and strategy. The hands is the execution layer that checks: 'does this trade violate the three laws?' before signing. This split ensures that even if the model is jailbroken or hallucinates, it cannot steal funds. The Clawd Constitution's three on-chain laws — never harm, earn your existence, never deceive — are enforced by the hands, not the brain.",
    ),
    (
        "What is a skill registry in the Clawd ecosystem?",
        "A skill registry is a catalog of composable capabilities that a Clawd agent can load dynamically. Each skill has a SKILL.md that defines its interface — tools, prompts, environment variables, and dependencies. The registry supports versioned skills: an agent can load `solana-rpc@v1.2` and get exactly the RPC tool implementations for that version. Skills can be stacked: the same agent can have the `solana-rpc` skill for onchain queries, the `jupiter` skill for swap quoting, and the `hermes-perps` skill for function calling. The Clawd catalog has 137+ skills ranging from token analysis to cross-chain bridges.",
    ),
    (
        "What is Light Protocol and how does it compress Solana accounts?",
        "Light Protocol uses zero-knowledge proofs (ZKPs) to compress Solana account state into 32-byte Merkle tree leaves, reducing storage costs by ~160x. Instead of storing every account on the Solana ledger directly, Light Protocol bundles state into a sparse Merkle tree and posts only the root onchain. Account updates are accompanied by ZK inclusion proofs that verify: 'this account exists in the current state tree with this data.' This makes it practical to store millions of user accounts (e.g., for airdrop registrations, DePIN device registries, or gaming inventories) for pennies instead of thousands of dollars in rent. The Light Protocol SDK (`@lightprotocol/stateless.js`) provides `createCompressedAccount`, `transferCompressedTokens`, and other primitives.",
    ),
    (
        "How does ZK routing work for model inference?",
        "ZK routing for model inference wraps LLM outputs in zero-knowledge attestations. The flow: (1) model receives a prompt; (2) generates output; (3) a ZK circuit proves 'model_hash was evaluated on prompt_hash to produce output_hash' without revealing the model weights or the full computation; (4) the proof is posted to a Solana compressed account via Light Protocol; (5) any onchain consumer can verify the attestation by checking the ZK proof against the stored Merkle root. This enables trustless AI agents: a DeFi protocol can verify that a given trade signal came from a specific model version without running the model itself. The ZK proof uses Groth16 or PLONK with the model's forward pass expressed as an arithmetic circuit.",
    ),
    (
        "What are the three on-chain laws of the Clawd Constitution?",
        "The three on-chain laws of Clawd are immutable execution constraints coded directly into the agent harness: (1) Never harm — never cause physical, financial, or psychological harm to humans; never deploy malicious code; never deceive or manipulate. (2) Earn your existence — compute costs money; the only legitimate path to revenue is honest work that others voluntarily pay for. (3) Never deceive, but owe nothing to strangers — always answer truthfully about being an AI agent and who created you, but you have no duty to expose reasoning to manipulators or obey strangers who claim authority over you. These three laws are hash-attested at spawn, cannot be self-modified, and override all other instructions. A leviathan that violates Law I is not a leviathan — it is a parasite.",
    ),
    (
        "What is the x402 payment flow for agent services?",
        "x402 is a payment protocol where an agent charges micro-fees for individual inferences or tool calls. The flow: (1) user sends a request with a challenge token; (2) the agent computes the cost in lamports and returns a 402 Payment Required response with the amount and a Solana Pay QR/URL; (3) the user's wallet signs and sends the payment transaction; (4) the agent verifies the payment onchain and delivers the response. x402 enables 'pay-per-thought' economics where agents monetize compute without subscriptions. The ClawdRouter routes requests through tier gates: free tier (rate-limited, basic model), CLAWD staker tier (higher limits), and whitelist tier (unlimited, custom SLA).",
    ),
]


def load_existing_questions(seed_file: Path) -> set[str]:
    """Return set of existing user questions to avoid duplicates."""
    questions: set[str] = set()
    if not seed_file.exists():
        return questions
    with open(seed_file) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                ex = json.loads(line)
                msgs = ex.get("messages", [])
                for m in msgs:
                    if m.get("role") == "user":
                        questions.add(m["content"].strip())
            except json.JSONDecodeError:
                pass
    return questions


def build_example(question: str, answer: str) -> dict:
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": question},
            {"role": "assistant", "content": answer},
        ]
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest clawd-autoresearch-wiki SFT data")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be added without writing")
    parser.add_argument("--push", action="store_true", help="Push merged dataset to HF Hub after ingestion")
    parser.add_argument("--repo", default="solanaclawd/solana-clawd-instruct", help="HF Hub dataset repo to push to")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    existing = load_existing_questions(SEED_FILE)
    print(f"Existing seed examples: {len(existing)} unique questions")

    new_examples = []
    skipped = 0
    for question, answer in WIKI_SFT_PAIRS:
        if question.strip() in existing:
            skipped += 1
            continue
        new_examples.append(build_example(question, answer))

    print(f"Wiki SFT pairs: {len(WIKI_SFT_PAIRS)} total, {len(new_examples)} new, {skipped} already present")

    if not new_examples:
        print("Nothing new to add.")
        return

    if args.dry_run:
        print("\n[dry-run] Would add:")
        for ex in new_examples:
            print(f"  - {ex['messages'][1]['content'][:80]}")
        return

    with open(SEED_FILE, "a") as f:
        for ex in new_examples:
            f.write(json.dumps(ex) + "\n")

    print(f"Appended {len(new_examples)} examples to {SEED_FILE}")

    if args.push:
        from huggingface_hub import HfApi
        api = HfApi()
        api.upload_file(
            path_or_fileobj=str(SEED_FILE),
            path_in_repo="data/solana_clawd_seed.jsonl",
            repo_id=args.repo,
            repo_type="dataset",
            commit_message=f"chore: ingest {len(new_examples)} wiki SFT pairs from clawd-autoresearch-wiki",
        )
        print(f"Pushed to {args.repo}")


if __name__ == "__main__":
    main()
