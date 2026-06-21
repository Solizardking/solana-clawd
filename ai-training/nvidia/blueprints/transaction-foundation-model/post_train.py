#!/usr/bin/env python3
"""Post-training continuation for the Solana transaction foundation model.

This is the command to run after the training job finishes. It keeps the
transaction model release path deterministic without requiring uploads or live
registry writes by default.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from tx_foundation_common import (
    AI_TRAINING_DIR,
    DEFAULT_CONFIG_PATH,
    DEFAULT_DATASET_MANIFEST,
    DEFAULT_EVAL_OUTPUT,
    DEFAULT_HUB_DATASET_ID,
    DEFAULT_HUB_MODEL_ID,
    DEFAULT_MODEL_OUTPUT,
    DEFAULT_PROCESSED_DIR,
    build_dataset_manifest,
    load_tx_config,
    write_dataset_manifest,
)


def run(cmd: list[str | Path], *, dry_run: bool, check: bool = True) -> int:
    printable = " ".join(str(part) for part in cmd)
    print(f"$ {printable}")
    if dry_run:
        return 0
    proc = subprocess.run([str(part) for part in cmd], cwd=str(AI_TRAINING_DIR), check=False)
    if check and proc.returncode != 0:
        raise RuntimeError(f"command failed ({proc.returncode}): {printable}")
    return proc.returncode


def require_yes(args: argparse.Namespace, action: str) -> None:
    if args.dry_run:
        return
    if not args.yes:
        raise RuntimeError(f"{action} requires --yes")


def write_summary(path: Path, summary: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"[tx-post] wrote {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH))
    parser.add_argument("--model", default=None, help="Local model path or Hub model id. Defaults to configured output_dir/sft.")
    parser.add_argument("--manifest", default=str(DEFAULT_DATASET_MANIFEST))
    parser.add_argument("--summary", default="outputs/tx_foundation_post_train_summary.json")
    parser.add_argument("--evaluate", action="store_true", help="Run transaction benchmark evaluation.")
    parser.add_argument("--bundle", action="store_true", help="Build the local Hugging Face release bundle.")
    parser.add_argument("--register", action="store_true", help="Run dao/register_model.sh for the model.")
    parser.add_argument("--live-register", action="store_true", help="Register with live off-chain registry instead of dry-run.")
    parser.add_argument("--onchain", action="store_true", help="Also request onchain registration. Requires --yes.")
    parser.add_argument("--eval-accuracy", default=None, help="Override registry eval accuracy. Defaults to eval avg_score if present.")
    parser.add_argument("--dataset-size", default=None, help="Override registry dataset size.")
    parser.add_argument("--endpoint", default="https://clawd-box-router.fly.dev/v1")
    parser.add_argument("--cluster", default="devnet")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--yes", action="store_true", help="Allow upload/register side effects.")
    args = parser.parse_args()

    cfg = load_tx_config(args.config)
    if args.model and "/" in args.model and not Path(args.model).exists():
        model = Path(cfg["output_dir"]) / "sft"
        model_ref = args.model
    else:
        model = Path(args.model) if args.model else Path(cfg["output_dir"]) / "sft"
        model_ref = str(model if model.exists() else cfg.get("hub_model_id", DEFAULT_HUB_MODEL_ID))
    manifest_path = Path(args.manifest)
    eval_path = Path(cfg.get("eval_output") or DEFAULT_EVAL_OUTPUT)

    manifest_kwargs = {
        "dataset_path": Path(cfg["cpt_data"]),
        "processed_dir": Path(cfg.get("processed_dir") or DEFAULT_PROCESSED_DIR),
        "config_path": Path(cfg["config_path"]),
        "eval_path": eval_path,
        "model_path": model if not str(model).startswith("solanaclawd/") else DEFAULT_MODEL_OUTPUT / "sft",
        "repo_id": cfg.get("hub_dataset_id", DEFAULT_HUB_DATASET_ID),
        "training_model": cfg.get("hub_model_id", DEFAULT_HUB_MODEL_ID),
    }
    if args.dry_run:
        manifest = build_dataset_manifest(**manifest_kwargs)
        print(f"[DRY RUN] would write {manifest_path}")
    else:
        manifest = write_dataset_manifest(manifest_path, **manifest_kwargs)

    if args.evaluate:
        run(
            [
                sys.executable,
                "nvidia/blueprints/transaction-foundation-model/evaluate.py",
                "--model",
                model_ref,
                "--output",
                str(eval_path),
            ],
            dry_run=args.dry_run,
        )

    if args.bundle:
        run(
            [
                sys.executable,
                "scripts/build_hf_release_bundle.py",
                "--dataset",
                "tx_foundation_cpt",
            ],
            dry_run=args.dry_run,
        )

    eval_accuracy = args.eval_accuracy
    if eval_accuracy is None and eval_path.exists():
        try:
            eval_accuracy = str(json.loads(eval_path.read_text(encoding="utf-8")).get("avg_score", "0.00"))
        except Exception:
            eval_accuracy = "0.00"
    eval_accuracy = eval_accuracy or "0.00"
    dataset_size = args.dataset_size or str(manifest.get("num_examples", 0))

    if args.register or args.live_register or args.onchain:
        if args.live_register or args.onchain:
            require_yes(args, "live transaction foundation registration")
        cmd: list[str | Path] = [
            "bash",
            "dao/register_model.sh",
            "--hf-model",
            str(cfg.get("hub_model_id", DEFAULT_HUB_MODEL_ID)),
            "--endpoint",
            args.endpoint,
            "--eval-accuracy",
            eval_accuracy,
            "--dataset-size",
            dataset_size,
            "--cluster",
            args.cluster,
        ]
        if not args.live_register:
            cmd.append("--dry-run")
        if args.onchain:
            cmd.append("--onchain")
        run(cmd, dry_run=args.dry_run)

    summary = build_dataset_manifest(
        dataset_path=Path(cfg["cpt_data"]),
        processed_dir=Path(cfg.get("processed_dir") or DEFAULT_PROCESSED_DIR),
        config_path=Path(cfg["config_path"]),
        eval_path=eval_path,
        model_path=model if model.exists() else Path(cfg["output_dir"]) / "sft",
        repo_id=cfg.get("hub_dataset_id", DEFAULT_HUB_DATASET_ID),
        training_model=cfg.get("hub_model_id", DEFAULT_HUB_MODEL_ID),
    )
    summary.update(
        {
            "model_ref": model_ref,
            "post_train_actions": {
                "evaluate": args.evaluate,
                "bundle": args.bundle,
                "register": bool(args.register or args.live_register or args.onchain),
                "live_register": args.live_register,
                "onchain": args.onchain,
            },
            "registry_eval_accuracy": eval_accuracy,
            "registry_dataset_size": dataset_size,
        }
    )
    if args.dry_run:
        print(f"[DRY RUN] would write {args.summary}")
    else:
        write_summary(Path(args.summary), summary)
    print("[tx-post] complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
