#!/usr/bin/env python3
"""Synchronize Solana Clawd bootstrap cells across the transaction notebooks."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


BLUEPRINT_DIR = Path(__file__).resolve().parent
NOTEBOOKS = [
    "01_dataset_baseline.ipynb",
    "02_seq_preproc_tokenization.ipynb",
    "03_foundation_model_training.ipynb",
    "04_inference_embedding_extraction.ipynb",
    "05_xgboost_fraud_detection.ipynb",
]

MARKDOWN_ID = "clawd-solana-bootstrap-markdown"
CODE_ID = "clawd-solana-bootstrap-code"

BOOTSTRAP_MARKDOWN = """## Clawd Solana Bootstrap

This notebook is wired to the local Solana Transaction Foundation Model
pipeline. Run the bootstrap cell first to discover the repo paths, unified
config, CPT dataset manifest, and post-training continuation status.

The original NVIDIA TabFormer reference cells remain below for reproducibility.
For the Solana production path, use `pipeline.py`, `post_train.py`, and
`scripts/after_transaction_foundation_job.sh`.
"""

BOOTSTRAP_CODE = r'''from pathlib import Path
import json
import sys

def _find_blueprint_dir() -> Path:
    cwd = Path.cwd().resolve()
    candidates = [cwd, *cwd.parents]
    for base in candidates:
        direct = base if (base / "tx_foundation_common.py").exists() else None
        nested = base / "ai-training" / "nvidia" / "blueprints" / "transaction-foundation-model"
        if direct is not None:
            return direct
        if (nested / "tx_foundation_common.py").exists():
            return nested
    raise RuntimeError("Could not find transaction-foundation-model/tx_foundation_common.py")

BLUEPRINT_DIR = _find_blueprint_dir()
AI_TRAINING_DIR = BLUEPRINT_DIR.parents[2]
if str(BLUEPRINT_DIR) not in sys.path:
    sys.path.insert(0, str(BLUEPRINT_DIR))

from tx_foundation_common import build_dataset_manifest, load_tx_config

cfg = load_tx_config()
manifest = build_dataset_manifest()
summary = {
    "ai_training_dir": str(AI_TRAINING_DIR),
    "config": cfg["config_path"],
    "cpt_data": cfg["cpt_data"],
    "sft_data": cfg["sft_data"],
    "output_dir": cfg["output_dir"],
    "hub_model_id": cfg["hub_model_id"],
    "cpt_examples": manifest["num_examples"],
    "splits": manifest["splits"],
    "local_model_present": manifest["local_model_present"],
    "eval_present": manifest["eval_present"],
}
print(json.dumps(summary, indent=2))
'''


def _cell(cell_type: str, source: str, cell_id: str) -> dict[str, Any]:
    cell: dict[str, Any] = {
        "cell_type": cell_type,
        "metadata": {"clawd_cell_id": cell_id, "tags": ["clawd-solana-bootstrap"]},
        "source": [line + "\n" for line in source.rstrip().splitlines()],
    }
    if cell_type == "code":
        cell.update({"execution_count": None, "outputs": []})
    return cell


def _find_cell(cells: list[dict[str, Any]], cell_id: str) -> int | None:
    for idx, cell in enumerate(cells):
        if cell.get("metadata", {}).get("clawd_cell_id") == cell_id:
            return idx
    return None


def _insert_index(cells: list[dict[str, Any]]) -> int:
    if cells and cells[0].get("cell_type") == "markdown":
        first = "".join(cells[0].get("source", []))
        if first.lstrip().startswith("<!--"):
            return 1
    return 0


def sync_notebook(path: Path) -> bool:
    nb = json.loads(path.read_text(encoding="utf-8"))
    cells = nb.setdefault("cells", [])
    desired = [
        _cell("markdown", BOOTSTRAP_MARKDOWN, MARKDOWN_ID),
        _cell("code", BOOTSTRAP_CODE, CODE_ID),
    ]
    changed = False

    for cell_id in (MARKDOWN_ID, CODE_ID):
        idx = _find_cell(cells, cell_id)
        if idx is not None:
            del cells[idx]
            changed = True

    idx = _insert_index(cells)
    cells[idx:idx] = desired
    changed = True

    path.write_text(json.dumps(nb, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return changed


def check_notebook(path: Path) -> tuple[bool, str]:
    try:
        nb = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return False, f"invalid JSON: {exc}"
    cells = nb.get("cells", [])
    has_md = _find_cell(cells, MARKDOWN_ID) is not None
    has_code = _find_cell(cells, CODE_ID) is not None
    if not has_md or not has_code:
        return False, "missing Clawd Solana bootstrap cells"
    return True, "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sync", action="store_true", help="Insert/update bootstrap cells")
    parser.add_argument("--check", action="store_true", help="Check notebook bootstrap cells")
    args = parser.parse_args()
    check_only = args.check or not args.sync

    ok = True
    if args.sync:
        for name in NOTEBOOKS:
            path = BLUEPRINT_DIR / name
            sync_notebook(path)
            print(f"SYNC {name}")

    if check_only or args.sync:
        for name in NOTEBOOKS:
            path = BLUEPRINT_DIR / name
            good, message = check_notebook(path)
            ok = good and ok
            print(f"{'OK' if good else 'FAIL'} {name}: {message}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
