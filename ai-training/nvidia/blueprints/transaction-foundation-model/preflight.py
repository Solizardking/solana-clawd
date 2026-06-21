#!/usr/bin/env python3
"""No-cost preflight for the Solana transaction foundation workflow."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from notebook_bridge import NOTEBOOKS, check_notebook
from tx_foundation_common import (
    AI_TRAINING_DIR,
    BLUEPRINT_DIR,
    DEFAULT_CONFIG_PATH,
    DEFAULT_DATASET_MANIFEST,
    DEFAULT_EVAL_OUTPUT,
    DEFAULT_HUB_DATASET_ID,
    DEFAULT_HUB_MODEL_ID,
    DEFAULT_PROCESSED_DIR,
    build_dataset_manifest,
    load_tx_config,
)


def command_available(name: str) -> bool:
    return shutil.which(name) is not None


def run_cmd(cmd: list[str | Path]) -> dict[str, Any]:
    proc = subprocess.run(
        [str(part) for part in cmd],
        cwd=str(AI_TRAINING_DIR),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return {
        "command": [str(part) for part in cmd],
        "returncode": proc.returncode,
        "output_tail": proc.stdout[-4000:],
    }


def remote_training_data_config(cfg: dict[str, Any]) -> dict[str, Any]:
    raw = cfg.get("remote_training_data", {})
    return raw if isinstance(raw, dict) else {}


def remote_dataset_report(cfg: dict[str, Any], *, enabled: bool) -> dict[str, Any] | None:
    remote = remote_training_data_config(cfg)
    repo_id = str(remote.get("repo_id", "") or "")
    if not repo_id:
        return None
    report: dict[str, Any] = {
        "repo_id": repo_id,
        "repo_type": remote.get("repo_type", "dataset"),
        "mount_path": remote.get("mount_path"),
        "cpt_data": remote.get("cpt_data"),
        "sft_data": remote.get("sft_data"),
        "manifest": remote.get("manifest"),
        "checked": enabled,
    }
    if not enabled:
        return report
    if not command_available("hf"):
        report.update({"ok": False, "error": "hf CLI not found"})
        return report
    cmd = ["hf", "datasets", "list", repo_id, "--json"]
    result = run_cmd(cmd)
    report["command"] = result["command"]
    report["returncode"] = result["returncode"]
    report["output_tail"] = result["output_tail"]
    if result["returncode"] != 0:
        report["ok"] = False
        return report
    try:
        files = json.loads(result["output_tail"])
    except json.JSONDecodeError:
        report["ok"] = False
        report["error"] = "could not parse hf datasets list JSON"
        return report
    names = {item.get("path") for item in files if isinstance(item, dict)}
    required = {
        Path(str(remote.get("cpt_data", ""))).name,
        Path(str(remote.get("sft_data", ""))).name,
        Path(str(remote.get("manifest", ""))).name,
    }
    required.discard("")
    report["files"] = sorted(name for name in names if name)
    report["required_files"] = sorted(required)
    report["missing_files"] = sorted(required - names)
    report["ok"] = not report["missing_files"]
    return report


def launch_dry_run_report() -> dict[str, Any]:
    script = AI_TRAINING_DIR / "scripts" / "launch_transaction_foundation_hf_job.sh"
    if not script.exists():
        return {"ok": False, "error": "launch script missing"}
    proc = subprocess.run(
        ["bash", str(script), "l4x1", "12h"],
        cwd=str(AI_TRAINING_DIR),
        env={**os.environ, "DRY_RUN": "1"},
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return {
        "command": ["DRY_RUN=1", "bash", str(script), "l4x1", "12h"],
        "returncode": proc.returncode,
        "output_tail": proc.stdout[-4000:],
        "ok": proc.returncode == 0,
    }


def last_launch_log() -> dict[str, Any] | None:
    log_dir = AI_TRAINING_DIR / "outputs" / "job-launches"
    logs = sorted(log_dir.glob("tx-foundation-launch-*.log")) if log_dir.exists() else []
    if not logs:
        return None
    path = logs[-1]
    text = path.read_text(encoding="utf-8", errors="ignore")
    return {
        "path": str(path),
        "hf_402": "402 Payment Required" in text or "Pre-paid credit balance is insufficient" in text,
        "tail": text[-2000:],
    }


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    cfg = load_tx_config(args.config)
    cpt_data = Path(cfg["cpt_data"])
    sft_data = Path(cfg["sft_data"])
    output_dir = Path(cfg["output_dir"])
    model_dir = output_dir / "sft"
    eval_path = Path(cfg.get("eval_output") or DEFAULT_EVAL_OUTPUT)
    processed_dir = Path(cfg.get("processed_dir") or DEFAULT_PROCESSED_DIR)
    manifest = build_dataset_manifest(
        dataset_path=cpt_data,
        processed_dir=processed_dir,
        config_path=Path(cfg["config_path"]),
        eval_path=eval_path,
        model_path=model_dir,
        repo_id=cfg.get("hub_dataset_id", DEFAULT_HUB_DATASET_ID),
        training_model=cfg.get("hub_model_id", DEFAULT_HUB_MODEL_ID),
    )

    notebook_dir = BLUEPRINT_DIR
    notebook_checks = {
        name: {"ok": ok, "message": message}
        for name in NOTEBOOKS
        for ok, message in [check_notebook(notebook_dir / name)]
    }

    trainer = "train_unsloth.py" if cfg.get("training_backend") == "unsloth" else "train.py"
    smoke_cmd = [
        sys.executable,
        f"nvidia/blueprints/transaction-foundation-model/{trainer}",
        "--config",
        cfg["config_path"],
        "--stage",
        "both",
        "--smoke",
        "--dry-run",
    ]
    smoke = run_cmd(smoke_cmd) if args.run_smoke_dry_run else None
    launch_dry_run = launch_dry_run_report() if args.run_launch_dry_run else None
    remote_dataset = remote_dataset_report(cfg, enabled=args.check_hf_dataset)

    hf_jobs = None
    if args.check_hf_jobs:
        if command_available("hf"):
            hf_jobs = run_cmd(["hf", "jobs", "ps", "--all"])
        else:
            hf_jobs = {"returncode": 127, "output_tail": "hf CLI not found"}

    required_local = {
        "config": Path(cfg["config_path"]).exists(),
        "cpt_data": cpt_data.exists(),
        "sft_data": sft_data.exists(),
        "processed_train": bool(manifest["processed_files"].get("train")),
        "processed_eval": bool(manifest["processed_files"].get("eval")),
        "processed_test": bool(manifest["processed_files"].get("test")),
        "launch_script": (AI_TRAINING_DIR / "scripts" / "launch_transaction_foundation_hf_job.sh").exists(),
        "watch_script": (AI_TRAINING_DIR / "scripts" / "watch_transaction_foundation_hf_job.sh").exists(),
        "post_train_script": (BLUEPRINT_DIR / "post_train.py").exists(),
        "notebooks_bootstrapped": all(item["ok"] for item in notebook_checks.values()),
    }
    ready_for_remote = all(required_local.values()) and manifest["num_examples"] > 0
    if launch_dry_run is not None:
        ready_for_remote = ready_for_remote and launch_dry_run["ok"]
    if remote_dataset is not None and remote_dataset.get("checked"):
        ready_for_remote = ready_for_remote and bool(remote_dataset.get("ok"))

    return {
        "config": cfg,
        "manifest": manifest,
        "required_local": required_local,
        "ready_for_remote_training": ready_for_remote,
        "local_model_present": model_dir.exists(),
        "eval_present": eval_path.exists(),
        "notebooks": notebook_checks,
        "smoke_dry_run": smoke,
        "launch_dry_run": launch_dry_run,
        "remote_dataset": remote_dataset,
        "hf_jobs": hf_jobs,
        "last_launch_log": last_launch_log(),
        "next_actions": [
            "Add Hugging Face Jobs credits if the last launch log shows hf_402=true.",
            "Launch: bash scripts/launch_transaction_foundation_hf_job.sh l4x1 12h",
            "Watch: bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID>",
            "After success: EVALUATE=1 BUNDLE=1 REGISTER=1 bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID>",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH))
    parser.add_argument("--output", default="outputs/tx_foundation_preflight.json")
    parser.add_argument("--check-hf-jobs", action="store_true", help="Include `hf jobs ps --all` output")
    parser.add_argument("--check-hf-dataset", action="store_true", help="Verify remote mounted training dataset files.")
    parser.add_argument("--run-smoke-dry-run", action="store_true", default=True)
    parser.add_argument("--no-smoke-dry-run", action="store_false", dest="run_smoke_dry_run")
    parser.add_argument("--run-launch-dry-run", action="store_true", default=True)
    parser.add_argument("--no-launch-dry-run", action="store_false", dest="run_launch_dry_run")
    parser.add_argument("--write-manifest", action="store_true", help="Also refresh tx_foundation_cpt_manifest.json")
    args = parser.parse_args()

    report = build_report(args)
    out = Path(args.output)
    if not out.is_absolute():
        out = AI_TRAINING_DIR / out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(out),
        "ready_for_remote_training": report["ready_for_remote_training"],
        "local_model_present": report["local_model_present"],
        "eval_present": report["eval_present"],
        "examples": report["manifest"]["num_examples"],
        "smoke_returncode": None if report["smoke_dry_run"] is None else report["smoke_dry_run"]["returncode"],
        "launch_dry_run_returncode": None if report["launch_dry_run"] is None else report["launch_dry_run"]["returncode"],
        "remote_dataset_ok": None if report["remote_dataset"] is None else report["remote_dataset"].get("ok"),
    }, indent=2))

    if args.write_manifest:
        DEFAULT_DATASET_MANIFEST.write_text(json.dumps(report["manifest"], indent=2) + "\n", encoding="utf-8")

    smoke_ok = report["smoke_dry_run"] is None or report["smoke_dry_run"]["returncode"] == 0
    launch_ok = report["launch_dry_run"] is None or report["launch_dry_run"]["returncode"] == 0
    return 0 if report["ready_for_remote_training"] and smoke_ok and launch_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
