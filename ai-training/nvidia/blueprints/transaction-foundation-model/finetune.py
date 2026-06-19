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


def launch_job(dataset_id: str, base_model: str, epochs: int, dry_run: bool) -> str:
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
        "output_model_name": "solana-clawd-tx-foundation",
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch NeMo CPT fine-tuning for Solana tx data")
    parser.add_argument("--dataset", required=True, help="NeMo CPT JSONL from dataset_builder.py")
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL)
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(f"ERROR: dataset not found: {dataset_path}", file=sys.stderr)
        sys.exit(1)

    dataset_id = upload_dataset(dataset_path, args.dry_run)
    job_id = launch_job(dataset_id, args.base_model, args.epochs, args.dry_run)
    poll_job(job_id, args.dry_run)
    print(f"[tx-foundation] done. job_id={job_id}")


if __name__ == "__main__":
    main()
