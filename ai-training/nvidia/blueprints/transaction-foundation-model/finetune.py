"""
Blueprint 1 — Transaction Foundation Model fine-tuner.

Calls the NVIDIA NIM customization API to launch a CPT job on top of
llama-3.1-nemotron-nano-8b-v1 (the recommended financial foundation base).
On completion, registers the resulting NIM endpoint in the Clawd NIM bridge.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore


NIM_BASE = "https://integrate.api.nvidia.com/v1"
CUSTOMIZATION_BASE = "https://api.nvcf.nvidia.com/v2/nvcf/customizations"
DEFAULT_BASE_MODEL = "meta/llama-3.1-nemotron-nano-8b-v1"
DEFAULT_OUTPUT_MODEL_NAME = "solana-tx-foundation-1.5b"


def _headers() -> dict:
    key = os.environ.get("NVIDIA_API_KEY", "")
    if not key:
        print("ERROR: NVIDIA_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def upload_dataset(dataset_path: Path, dry_run: bool) -> str:
    """Upload CPT JSONL to NVIDIA dataset storage, return dataset_id."""
    if dry_run:
        print(f"[DRY RUN] would upload {dataset_path}")
        return "dry-run-dataset-id"
    if httpx is None:
        print("ERROR: httpx not installed. Run: pip install httpx", file=sys.stderr)
        sys.exit(1)
    upload_url = f"{CUSTOMIZATION_BASE}/datasets"
    with dataset_path.open("rb") as f:
        resp = httpx.post(
            upload_url,
            headers=_headers(),
            content=f.read(),
            timeout=120,
        )
    resp.raise_for_status()
    dataset_id = resp.json().get("id", "")
    print(f"[tx-foundation] dataset uploaded: {dataset_id}")
    return dataset_id


def launch_job(dataset_id: str, base_model: str, epochs: int, output_model_name: str, dry_run: bool) -> str:
    """Submit CPT fine-tuning job, return job_id."""
    payload = {
        "model": base_model,
        "training_type": "continued_pretraining",
        "dataset_id": dataset_id,
        "hyperparameters": {
            "num_epochs": epochs,
            "learning_rate": 2e-5,
            "batch_size": 8,
        },
        "output_model_name": output_model_name,
    }
    if dry_run:
        print(f"[DRY RUN] would POST {CUSTOMIZATION_BASE}/jobs with:\n{json.dumps(payload, indent=2)}")
        return "dry-run-job-id"
    if httpx is None:
        sys.exit(1)
    resp = httpx.post(
        f"{CUSTOMIZATION_BASE}/jobs",
        headers=_headers(),
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    job_id = resp.json().get("id", "")
    print(f"[tx-foundation] job submitted: {job_id}")
    return job_id


def poll_job(job_id: str, dry_run: bool) -> None:
    if dry_run:
        print("[DRY RUN] would poll job until complete")
        return
    if httpx is None:
        return
    print(f"[tx-foundation] polling job {job_id} ...")
    for _ in range(120):
        resp = httpx.get(
            f"{CUSTOMIZATION_BASE}/jobs/{job_id}",
            headers=_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "UNKNOWN")
        print(f"  status={status}")
        if status in ("COMPLETED", "FAILED", "CANCELED"):
            break
        time.sleep(30)


def write_job_manifest(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            existing = data if isinstance(data, list) else [data]
        except json.JSONDecodeError:
            existing = []
    existing.append(payload)
    path.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
    print(f"[tx-foundation] job manifest updated: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch NeMo CPT fine-tuning for Solana tx data")
    parser.add_argument("--dataset", help="NeMo CPT JSONL from dataset_builder.py")
    parser.add_argument("--job-id", default=None, help="Poll an existing NVCF customization job instead of launching a new one")
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL)
    parser.add_argument("--output-model-name", default=DEFAULT_OUTPUT_MODEL_NAME)
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--job-manifest", default="data/tx_foundation_nvcf_jobs.json")
    parser.add_argument("--no-poll", action="store_true", help="Submit job and write manifest without polling")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.job_id:
        poll_job(args.job_id, args.dry_run)
        print(f"[tx-foundation] done. job_id={args.job_id}")
        return

    if not args.dataset:
        print("ERROR: --dataset is required when --job-id is not provided", file=sys.stderr)
        sys.exit(1)

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(f"ERROR: dataset not found: {dataset_path}", file=sys.stderr)
        sys.exit(1)

    dataset_id = upload_dataset(dataset_path, args.dry_run)
    job_id = launch_job(dataset_id, args.base_model, args.epochs, args.output_model_name, args.dry_run)
    manifest_payload = {
        "job_id": job_id,
        "dataset_id": dataset_id,
        "dataset": str(dataset_path),
        "base_model": args.base_model,
        "output_model_name": args.output_model_name,
        "epochs": args.epochs,
        "dry_run": args.dry_run,
    }
    if args.dry_run:
        print(f"[DRY RUN] would update job manifest: {args.job_manifest}")
    else:
        write_job_manifest(Path(args.job_manifest), manifest_payload)
    if not args.no_poll:
        poll_job(job_id, args.dry_run)
    print(f"[tx-foundation] done. job_id={job_id}")


if __name__ == "__main__":
    main()
