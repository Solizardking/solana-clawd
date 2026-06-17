#!/usr/bin/env python3
"""Poll a Fireworks on-demand deployment until it is ready or failed."""
from __future__ import annotations

import argparse
import json
import os
import time
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen


API_BASE = "https://api.fireworks.ai/v1"
TERMINAL_STATES = {"READY", "FAILED", "DELETING"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-key", default=os.environ.get("FIREWORKS_API_KEY"))
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--deployment-id", required=True)
    parser.add_argument("--interval", type=float, default=30.0)
    parser.add_argument("--once", action="store_true")
    return parser.parse_args()


def get_deployment(api_key: str, account_id: str, deployment_id: str) -> dict[str, Any]:
    request = Request(
        f"{API_BASE}/accounts/{account_id}/deployments/{deployment_id}",
        headers={
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "curl/8.0 codex-fireworks-deployment-monitor",
        },
    )
    try:
        with urlopen(request) as response:
            return json.loads(response.read())
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Fireworks deployment status request failed: HTTP {exc.code} {detail}") from exc


def summarize(deployment: dict[str, Any]) -> dict[str, Any]:
    status = deployment.get("status") or {}
    stats = deployment.get("replicaStats") or {}
    return {
        "name": deployment.get("name"),
        "state": deployment.get("state"),
        "status": status.get("message") or status.get("code"),
        "base_model": deployment.get("baseModel"),
        "accelerator": deployment.get("acceleratorType"),
        "accelerator_count": deployment.get("acceleratorCount"),
        "precision": deployment.get("precision"),
        "ready_replicas": stats.get("readyReplicaCount"),
        "initializing_replicas": stats.get("initializingReplicaCount"),
        "pending_replicas": stats.get("pendingSchedulingReplicaCount"),
        "created": deployment.get("createTime"),
        "updated": deployment.get("updateTime"),
    }


def main() -> None:
    args = parse_args()
    if not args.api_key:
        raise SystemExit("FIREWORKS_API_KEY or --api-key is required")

    while True:
        deployment = get_deployment(args.api_key, args.account_id, args.deployment_id)
        print(json.dumps(summarize(deployment), indent=2), flush=True)
        if args.once or deployment.get("state") in TERMINAL_STATES:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
