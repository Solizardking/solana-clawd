#!/usr/bin/env python3
"""
Create Fireworks datasets and launch a supervised fine-tuning job.

This script packages the *actual* Fireworks training inputs from ai-training:

  - training dataset: data/solana_clawd_seed.jsonl
  - evaluation dataset: data/solana_clawd_eval.jsonl

It then drives the documented Fireworks REST API flow:

  1. create training dataset
  2. upload training file
  3. validate training upload
  4. optionally create + upload eval dataset
  5. create supervised fine-tuning job

Docs used:
  - POST /v1/accounts/{account_id}/datasets
  - POST /v1/accounts/{account_id}/datasets/{dataset_id}:upload
  - POST /v1/accounts/{account_id}/datasets/{dataset_id}:validateUpload
  - POST /v1/accounts/{account_id}/supervisedFineTuningJobs

Usage:
  export FIREWORKS_API_KEY=...
  python3 ai-training/scripts/deploy_fireworks.py \
    --account-id <account_id> \
    --base-model qwen2p5-7b-instruct \
    --dataset-id solana-clawd \
    --output-model qwensolana

  # Launch a new SFT job from already-uploaded Fireworks datasets:
  python3 ai-training/scripts/deploy_fireworks.py \
    --account-id <account_id> \
    --dataset-id solana-clawd-20260617 \
    --eval-dataset-id solana-clawd-eval-20260617 \
    --base-model qwen2p5-7b-instruct \
    --output-model clawd-glm-5-2 \
    --reuse-datasets
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
TRAIN_FILE = ROOT / "data" / "solana_clawd_seed.jsonl"
EVAL_FILE = ROOT / "data" / "solana_clawd_eval.jsonl"
API_BASE = "https://api.fireworks.ai/v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-key", default=os.environ.get("FIREWORKS_API_KEY"))
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--dataset-id", default="solana-clawd")
    parser.add_argument("--dataset-display-name", default="Solana Clawd")
    parser.add_argument("--eval-dataset-id", default="solana-clawd-eval")
    parser.add_argument("--eval-dataset-display-name", default="Solana Clawd Eval")
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--output-model", required=True)
    parser.add_argument("--display-name", default="Solana Clawd Supervised Fine-Tune")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--max-context-length", type=int, default=8192)
    parser.add_argument("--lora-rank", type=int, default=8)
    parser.add_argument("--eval-auto-carveout", action="store_true")
    parser.add_argument("--job-id", default=None)
    parser.add_argument("--skip-eval-dataset", action="store_true")
    parser.add_argument("--reuse-datasets", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def api_request(
    api_key: str,
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    request_headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "curl/8.0 codex-fireworks-deploy",
    }
    if headers:
        request_headers.update(headers)
    payload = body
    if json_body is not None:
        payload = json.dumps(json_body).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = Request(url, data=payload, method=method, headers=request_headers)
    try:
        with urlopen(request) as response:
            raw = response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {url} failed: HTTP {exc.code} {detail}") from exc
    if not raw:
        return {}
    return json.loads(raw)


def multipart_file_body(field_name: str, path: Path) -> tuple[bytes, str]:
    boundary = f"----codex-fireworks-{uuid.uuid4().hex}"
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
    return head + path.read_bytes() + tail, boundary


def count_examples(path: Path) -> str:
    return str(sum(1 for line in path.read_text().splitlines() if line.strip()))


def create_dataset(
    api_key: str,
    account_id: str,
    dataset_id: str,
    display_name: str,
    source_path: Path,
    dry_run: bool,
) -> dict[str, Any]:
    body = {
        "dataset": {
            "displayName": display_name,
            "userUploaded": {},
            "format": "CHAT",
            "exampleCount": count_examples(source_path),
        },
        "datasetId": dataset_id,
    }
    if dry_run:
        return {"dry_run": True, "request": body}
    return api_request(api_key, "POST", f"{API_BASE}/accounts/{account_id}/datasets", json_body=body)


def upload_dataset_file(api_key: str, account_id: str, dataset_id: str, path: Path, dry_run: bool) -> dict[str, Any]:
    body, boundary = multipart_file_body("file", path)
    if dry_run:
        return {"dry_run": True, "dataset_id": dataset_id, "file": str(path)}
    return api_request(
        api_key,
        "POST",
        f"{API_BASE}/accounts/{account_id}/datasets/{dataset_id}:upload",
        body=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )


def validate_dataset(api_key: str, account_id: str, dataset_id: str, dry_run: bool) -> dict[str, Any]:
    if dry_run:
        return {"dry_run": True, "dataset_id": dataset_id}
    return api_request(
        api_key,
        "POST",
        f"{API_BASE}/accounts/{account_id}/datasets/{dataset_id}:validateUpload",
        json_body={},
    )


def create_sft_job(args: argparse.Namespace, evaluation_dataset: str | None) -> dict[str, Any]:
    account_prefix = f"accounts/{args.account_id}"
    dataset_name = args.dataset_id
    if not dataset_name.startswith("accounts/"):
        dataset_name = f"{account_prefix}/datasets/{dataset_name}"
    output_model = args.output_model
    if not output_model.startswith("accounts/"):
        output_model = f"{account_prefix}/models/{output_model}"
    base_model = args.base_model
    if not base_model.startswith("accounts/"):
        base_model = f"accounts/fireworks/models/{base_model}"
    body: dict[str, Any] = {
        "dataset": dataset_name,
        "displayName": args.display_name,
        "outputModel": output_model,
        "baseModel": base_model,
        "epochs": args.epochs,
        "learningRate": args.learning_rate,
        "maxContextLength": args.max_context_length,
        "loraRank": args.lora_rank,
        "evalAutoCarveout": args.eval_auto_carveout,
    }
    if evaluation_dataset:
        if not evaluation_dataset.startswith("accounts/"):
            evaluation_dataset = f"{account_prefix}/datasets/{evaluation_dataset}"
        body["evaluationDataset"] = evaluation_dataset
    job_id = args.job_id
    url = f"{API_BASE}/accounts/{args.account_id}/supervisedFineTuningJobs"
    if job_id:
        url = f"{url}?supervisedFineTuningJobId={job_id}"
    if args.dry_run:
        return {"dry_run": True, "url": url, "request": body}
    return api_request(args.api_key, "POST", url, json_body=body)


def ensure_inputs() -> None:
    missing = [str(path) for path in [TRAIN_FILE, EVAL_FILE] if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing required Fireworks dataset files: {', '.join(missing)}")


def main() -> None:
    args = parse_args()
    if not args.api_key:
        raise SystemExit("FIREWORKS_API_KEY or --api-key is required")
    ensure_inputs()

    results: dict[str, Any] = {}
    if args.reuse_datasets:
        results["train_dataset"] = {"reused": True, "dataset_id": args.dataset_id}
    else:
        results["train_dataset"] = create_dataset(
            args.api_key,
            args.account_id,
            args.dataset_id,
            args.dataset_display_name,
            TRAIN_FILE,
            args.dry_run,
        )
        results["train_upload"] = upload_dataset_file(
            args.api_key,
            args.account_id,
            args.dataset_id,
            TRAIN_FILE,
            args.dry_run,
        )
        results["train_validate"] = validate_dataset(
            args.api_key,
            args.account_id,
            args.dataset_id,
            args.dry_run,
        )

    evaluation_dataset = None
    if not args.skip_eval_dataset:
        evaluation_dataset = args.eval_dataset_id
        if args.reuse_datasets:
            results["eval_dataset"] = {"reused": True, "dataset_id": args.eval_dataset_id}
        else:
            results["eval_dataset"] = create_dataset(
                args.api_key,
                args.account_id,
                args.eval_dataset_id,
                args.eval_dataset_display_name,
                EVAL_FILE,
                args.dry_run,
            )
            results["eval_upload"] = upload_dataset_file(
                args.api_key,
                args.account_id,
                args.eval_dataset_id,
                EVAL_FILE,
                args.dry_run,
            )
            results["eval_validate"] = validate_dataset(
                args.api_key,
                args.account_id,
                args.eval_dataset_id,
                args.dry_run,
            )

    results["sft_job"] = create_sft_job(args, evaluation_dataset)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
