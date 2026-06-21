"""
Solana CLM Dataset — NeMo AutoModel-compatible data module.

Adapts the NVIDIA financial CLM dataset for Solana transaction sequences
tokenized by SolanaTokenizerPipeline.

Corpus format (one line per tx sequence):
    <bos> PROG_42 IX_SWAP MINT_0 MINT_1 AMT_5 AMT_6 FEE_2 SLOT_33 SIDE_BUY STATUS_SUCCESS <eos>

NeMo AutoModel integration via _target_::
    dataset:
      _target_: src/solana_clm_data.py:build_solana_clm_dataset
      data_path: data/tx_foundation_cpt.jsonl
      seq_length: 2048
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List, Union

import torch
from torch.utils.data import Dataset

_src_dir = str(Path(__file__).resolve().parent)
if _src_dir not in sys.path:
    sys.path.insert(0, _src_dir)

try:
    from .tokenizer.solana_tokenizer import SolanaTokenizerPipeline
except ImportError:
    from tokenizer.solana_tokenizer import SolanaTokenizerPipeline  # type: ignore


class SolanaTransactionDataset(Dataset):
    """
    PyTorch Dataset for Solana transaction sequences.

    Accepts either:
    - A pre-tokenized .txt corpus (one space-separated token-id sequence per line)
    - A .jsonl file of raw Solana tx dicts (tokenized on the fly)
    """

    def __init__(
        self,
        data_path: Union[str, Path],
        seq_length: int = 2048,
        tokenizer: SolanaTokenizerPipeline = None,
        prog_hash_size: int = 512,
        mint_hash_size: int = 4096,
    ):
        self.seq_length = seq_length
        self.tokenizer = tokenizer or SolanaTokenizerPipeline(
            prog_hash_size=prog_hash_size,
            mint_hash_size=mint_hash_size,
        )
        self.pad_id = self.tokenizer.SPECIAL_TOKENS["<pad>"]
        self.sequences: List[List[int]] = []
        self._load(Path(data_path))

    def _load(self, path: Path) -> None:
        suffix = path.suffix.lower()
        if suffix == ".jsonl":
            self._load_jsonl(path)
        elif suffix == ".txt":
            self._load_txt(path)
        else:
            raise ValueError(f"Unsupported data format: {suffix}")

    def _load_jsonl(self, path: Path) -> None:
        with path.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                # Support both raw tx dict and {"text": "..."} CPT format
                if "text" in obj:
                    # Text already serialized — re-tokenize as a single sequence
                    ids = [self.tokenizer.SPECIAL_TOKENS["<bos>"]] + \
                          [self.tokenizer._vocab.get(t, self.tokenizer.SPECIAL_TOKENS["<unk>"])
                           for t in obj["text"].split()] + \
                          [self.tokenizer.SPECIAL_TOKENS["<eos>"]]
                else:
                    ids = self.tokenizer.tokenize_row(obj)
                self.sequences.append(ids)

    def _load_txt(self, path: Path) -> None:
        with path.open() as f:
            for line in f:
                ids = [int(x) for x in line.strip().split() if x]
                if ids:
                    self.sequences.append(ids)

    def _pad_or_truncate(self, ids: List[int]) -> List[int]:
        if len(ids) >= self.seq_length:
            return ids[: self.seq_length]
        return ids + [self.pad_id] * (self.seq_length - len(ids))

    def __len__(self) -> int:
        return len(self.sequences)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        ids = self._pad_or_truncate(self.sequences[idx])
        input_ids = torch.tensor(ids, dtype=torch.long)
        labels = input_ids.clone()
        labels[labels == self.pad_id] = -100
        return {"input_ids": input_ids, "labels": labels}

    @property
    def vocab_size(self) -> int:
        return self.tokenizer.vocab_size


def build_solana_clm_dataset(
    data_path: Union[str, Path],
    seq_length: int = 2048,
    prog_hash_size: int = 512,
    mint_hash_size: int = 4096,
) -> SolanaTransactionDataset:
    """Factory function for NeMo AutoModel _target_ resolution."""
    return SolanaTransactionDataset(
        data_path=data_path,
        seq_length=seq_length,
        prog_hash_size=prog_hash_size,
        mint_hash_size=mint_hash_size,
    )
