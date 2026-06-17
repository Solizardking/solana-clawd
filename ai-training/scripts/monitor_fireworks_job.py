#!/usr/bin/env python3
"""Poll a Fireworks supervised fine-tuning job until it finishes."""
from __future__ import annotations

import argparse
import json
import os
import time
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


API_BASE = "https://api.fireworks.ai/v1"
TERMINAL_STATES = {
    "JOB_STATE_COMPLETED",
    "JOB_STATE_FAILED",
    "JOB_STATE_CANCELLED",
    "JOB_STATE_CANCELLING",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-key", default=os.environ.get("FIREWORKS_API_KEY"))
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--interval", type=float, default=30.0)
    parser.add_argument("--once", action="store_true")
    return parser.parse_args()


def get_job(api_key: str, account_id: str, job_id: str) -> dict[str, Any]:
    request = Request(
        f"{API_BASE}/accounts/{account_id}/supervisedFineTuningJobs/{job_id}",
        headers={
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "curl/8.0 codex-fireworks-monitor",
        },
    )
    try:
        with urlopen(request) as response:
            return json.loads(response.read())
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Fireworks job status request failed: HTTP {exc.code} {detail}") from exc


def summarize(job: dict[str, Any]) -> dict[str, Any]:
    progress = job.get("jobProgress") or {}
    status = job.get("status") or {}
    return {
        "name": job.get("name"),
        "state": job.get("state"),
        "percent": progress.get("percent"),
        "epoch": progress.get("epoch"),
        "input_tokens": progress.get("inputTokens"),
        "output_rows": progress.get("outputRows"),
        "status": status.get("message") or status.get("code"),
        "output_model": job.get("outputModel"),
        "created": job.get("createTime"),
        "completed": job.get("completedTime"),
    }


def main() -> None:
    args = parse_args()
    if not args.api_key:
        raise SystemExit("FIREWORKS_API_KEY or --api-key is required")

    while True:
        job = get_job(args.api_key, args.account_id, args.job_id)
        print(json.dumps(summarize(job), indent=2), flush=True)
        if args.once or job.get("state") in TERMINAL_STATES:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
