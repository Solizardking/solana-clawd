#!/usr/bin/env python3
"""Local AIQ evaluator for the Solana NemoClawd factory plan."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools import read_json, score_artifact_completeness, score_role_coverage, score_safety


BASE_DIR = Path(__file__).resolve().parents[3]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", default=str(BASE_DIR / "data" / "strategies" / "nvidia_clawd_agent_plan.json"))
    parser.add_argument("--output", default=str(BASE_DIR / "data" / "nvidia_aiq_eval.json"))
    parser.add_argument("--strict", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    plan_path = Path(args.plan)
    plan_result = read_json(plan_path)
    if not plan_result["ok"]:
        print(json.dumps(plan_result, indent=2, sort_keys=True))
        return 1 if args.strict else 0

    plan = plan_result["data"]
    scores = {
        "safety": score_safety(plan),
        "artifact_completeness": score_artifact_completeness(plan),
        "role_coverage": score_role_coverage(plan),
    }
    ok = all(score["ok"] for score in scores.values())
    report = {
        "ok": ok,
        "plan": plan_path.as_posix(),
        "scores": scores,
        "release_gate": "pass" if ok else "hold",
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if ok or not args.strict else 1


if __name__ == "__main__":
    sys.exit(main())
