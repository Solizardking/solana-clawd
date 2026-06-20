# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""
Solana transaction tokenizer — extends the NVIDIA financial tokenizer base
for on-chain Solana data (Jupiter swaps, Phoenix perps, SPL transfers).

Handles Solana-specific fields:
  PROG   — program_id hash bucket (DEX router, AMM, perps, etc.)
  IX     — instruction type categorical
  MINT   — token mint hash bucket (SOL, USDC, JUP, bonk, etc.)
  AMT    — lamport / token amount (log-compressed bins)
  SLOT   — slot-relative time bucket (replaces clock-of-day)
  SIDE   — trade side (BUY/SELL/NA)
  STATUS — tx status (SUCCESS/FAIL)
  FEE    — fee tier bucket

Falls back to pandas on CPU when cudf is not available (e.g. local dev).
GPU path is identical to the financial tokenizer pipeline but uses Solana
field names. cudf is swapped for pandas transparently via the _series helper.
"""

from __future__ import annotations

import hashlib
import math
from typing import Dict, List, Optional

try:
    import cudf
    import cupy as cp
    _GPU = True
except ImportError:
    import pandas as cudf  # type: ignore[assignment]  # noqa: F401
    _GPU = False

import pandas as pd


# ── Solana-specific token vocabulary constants ────────────────────────────

SOLANA_PROGRAMS = {
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "PROG_JUP",
    "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY": "PROG_PHX",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "PROG_RAY",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "PROG_ORC",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "PROG_SPL",
    "So11111111111111111111111111111111111111112": "MINT_SOL",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "MINT_USDC",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "MINT_JUP",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "MINT_BONK",
}

INSTRUCTION_TYPES = [
    "SWAP", "TRANSFER", "OPEN_POSITION", "CLOSE_POSITION", "PLACE_ORDER",
    "CANCEL_ORDER", "FILL", "DEPOSIT", "WITHDRAW", "MINT", "BURN", "UNKNOWN",
]

TRADE_SIDES = ["BUY", "SELL", "NA"]
TX_STATUSES = ["SUCCESS", "FAIL"]
FEE_TIERS = [0, 1, 5, 10, 25, 100]  # bps


# ── Amount bins (log-scale over lamports) ─────────────────────────────────

def _log_bins(max_exp: int = 15, steps: int = 8) -> List[float]:
    bins = [0.0]
    for exp in range(0, max_exp):
        for step in range(steps):
            bins.append(10 ** (exp + step / steps))
    bins.append(float("inf"))
    return sorted(set(bins))


LAMPORT_BINS = _log_bins()


# ── Core tokenizer ─────────────────────────────────────────────────────────

class SolanaTokenizerPipeline:
    """
    Tokenizes a batch of Solana transactions into integer token sequences.

    Input: dict or pandas DataFrame with columns:
        program_id, instruction_type, input_mint, output_mint,
        in_amount, out_amount, fee_bps, slot, side, status

    Output: List[List[int]] — one integer sequence per transaction.
    """

    SPECIAL_TOKENS = {"<pad>": 0, "<bos>": 1, "<eos>": 2, "<sep>": 3, "<unk>": 4}
    _RESERVED = len(SPECIAL_TOKENS)

    def __init__(
        self,
        prog_hash_size: int = 512,
        mint_hash_size: int = 4096,
        amount_bins: Optional[List[float]] = None,
        slot_buckets: int = 128,
    ):
        self.prog_hash_size = prog_hash_size
        self.mint_hash_size = mint_hash_size
        self.amount_bins = amount_bins or LAMPORT_BINS
        self.slot_buckets = slot_buckets
        self._vocab: Dict[str, int] = dict(self.SPECIAL_TOKENS)
        self._build_vocab()

    # ── Vocab construction ────────────────────────────────────────────────

    def _add(self, token: str) -> int:
        if token not in self._vocab:
            self._vocab[token] = len(self._vocab)
        return self._vocab[token]

    def _build_vocab(self) -> None:
        for i in range(self.prog_hash_size):
            self._add(f"PROG_{i}")
        for ix in INSTRUCTION_TYPES:
            self._add(f"IX_{ix}")
        for i in range(self.mint_hash_size):
            self._add(f"MINT_{i}")
        for i in range(len(self.amount_bins) - 1):
            self._add(f"AMT_{i}")
        for i in range(self.slot_buckets):
            self._add(f"SLOT_{i}")
        for s in TRADE_SIDES:
            self._add(f"SIDE_{s}")
        for s in TX_STATUSES:
            self._add(f"STATUS_{s}")
        for i in range(len(FEE_TIERS) + 1):
            self._add(f"FEE_{i}")

    @property
    def vocab_size(self) -> int:
        return len(self._vocab)

    # ── Field tokenizers ──────────────────────────────────────────────────

    def _hash_prog(self, program_id: str) -> str:
        h = int(hashlib.sha256(program_id.encode()).hexdigest(), 16)
        return f"PROG_{h % self.prog_hash_size}"

    def _hash_mint(self, mint: str) -> str:
        h = int(hashlib.sha256(mint.encode()).hexdigest(), 16)
        return f"MINT_{h % self.mint_hash_size}"

    def _bin_amount(self, amount: float) -> str:
        for i, (lo, hi) in enumerate(
            zip(self.amount_bins, self.amount_bins[1:])
        ):
            if lo <= amount < hi:
                return f"AMT_{i}"
        return f"AMT_{len(self.amount_bins) - 2}"

    def _bin_slot(self, slot: int, epoch_slots: int = 432_000) -> str:
        bucket = (slot % epoch_slots) * self.slot_buckets // epoch_slots
        return f"SLOT_{bucket}"

    def _bin_fee(self, fee_bps: int) -> str:
        for i, tier in enumerate(sorted(FEE_TIERS)):
            if fee_bps <= tier:
                return f"FEE_{i}"
        return f"FEE_{len(FEE_TIERS)}"

    # ── Main tokenize method ──────────────────────────────────────────────

    def tokenize_row(self, row: dict) -> List[int]:
        tokens = [self.SPECIAL_TOKENS["<bos>"]]

        def tok(t: str) -> int:
            return self._vocab.get(t, self.SPECIAL_TOKENS["<unk>"])

        tokens.append(tok(self._hash_prog(row.get("program_id", ""))))
        tokens.append(tok(f"IX_{row.get('instruction_type', 'UNKNOWN')}"))
        tokens.append(tok(self._hash_mint(row.get("input_mint", ""))))
        tokens.append(tok(self._hash_mint(row.get("output_mint", ""))))
        tokens.append(tok(self._bin_amount(float(row.get("in_amount", 0)))))
        tokens.append(tok(self._bin_amount(float(row.get("out_amount", 0)))))
        tokens.append(tok(self._bin_fee(int(row.get("fee_bps", 0)))))
        tokens.append(tok(self._bin_slot(int(row.get("slot", 0)))))
        tokens.append(tok(f"SIDE_{row.get('side', 'NA')}"))
        tokens.append(tok(f"STATUS_{row.get('status', 'SUCCESS')}"))
        tokens.append(self.SPECIAL_TOKENS["<eos>"])
        return tokens

    def tokenize_batch(self, rows: List[dict]) -> List[List[int]]:
        return [self.tokenize_row(r) for r in rows]

    def decode(self, ids: List[int]) -> List[str]:
        inv = {v: k for k, v in self._vocab.items()}
        return [inv.get(i, "<unk>") for i in ids]


# ── Text serializer (for CPT jsonl ← collect.py) ──────────────────────────

def tx_to_text(tx: dict) -> str:
    """Convert a Solana tx dict to a structured text string for CPT."""
    prog = tx.get("program_id", "")[:8]
    ix = tx.get("instruction_type", "UNKNOWN")
    in_mint = tx.get("input_mint", "")[:8]
    out_mint = tx.get("output_mint", "")[:8]
    in_amt = tx.get("in_amount", 0)
    out_amt = tx.get("out_amount", 0)
    fee_bps = tx.get("fee_bps", 0)
    slot = tx.get("slot", 0)
    side = tx.get("side", "NA")
    status = tx.get("status", "SUCCESS")

    return (
        f"[TX] prog={prog} ix={ix} "
        f"in={in_mint}:{in_amt} out={out_mint}:{out_amt} "
        f"fee={fee_bps}bps slot={slot} side={side} status={status}"
    )
