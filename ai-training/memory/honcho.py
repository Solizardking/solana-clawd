"""
Honcho-powered persistent memory for Clawd training agents.

Ported from clawd-autoresearch-wiki/memory/honcho.py.
Provides cross-session memory for the training pipeline: remembers eval results,
dataset decisions, and experiment lessons that survive context wipes.

Usage:
    from memory.honcho import AgentMemory

    mem = AgentMemory(api_key="hch-...", workspace="clawd-training")

    # Remember an eval result
    mem.remember("Baseline Qwen3-14B got 60% accuracy on JSON QA benchmark")

    # Recall past decisions
    ctx = mem.recall("What was the last model accuracy?")

    # Bridge across training sessions
    mem.bridge_session("What happened last training run?")

    # Autonomous consolidation
    summary = mem.dream()
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

try:
    from honcho import Honcho as _Honcho
    HONCHO_SDK_AVAILABLE = True
except ImportError:
    HONCHO_SDK_AVAILABLE = False
    _Honcho = None  # type: ignore


@dataclass
class MemoryConfig:
    api_key: str = ""
    workspace_id: str = "clawd-training"
    environment: str = "production"
    base_url: str = "https://api.honcho.dev"
    peer_name: str = "clawd-training-agent"
    default_session: str = "clawd-train-main"
    reasoning_level: str = "low"
    auto_dream: bool = True
    dream_interval_hours: int = 8


class AgentMemory:
    """Persistent cross-session memory for the Clawd training pipeline."""

    def __init__(self, api_key: str | None = None, workspace: str = "clawd-training",
                 peer_name: str = "clawd-training-agent"):
        resolved_key = api_key or os.environ.get("HONCHO_API_KEY", "")
        self.config = MemoryConfig(
            api_key=resolved_key,
            workspace_id=workspace,
            peer_name=peer_name,
        )
        self._client = None
        self._app_id: str | None = None
        self._user_id: str | None = None
        self._session_id: str | None = None
        self._last_dream: float = 0.0
        self._local_log: list[dict[str, Any]] = []  # fallback if SDK unavailable

        if HONCHO_SDK_AVAILABLE and resolved_key:
            self._init_honcho()

    def _init_honcho(self) -> None:
        try:
            self._client = _Honcho(
                api_key=self.config.api_key,
                environment=self.config.environment,
            )
            app = self._client.apps.get_or_create(name=self.config.workspace_id)
            self._app_id = app.id
            user = self._client.apps.users.get_or_create(
                app_id=self._app_id, name=self.config.peer_name
            )
            self._user_id = user.id
            session = self._client.apps.users.sessions.create(
                app_id=self._app_id, user_id=self._user_id
            )
            self._session_id = session.id
        except Exception as e:
            print(f"[memory] Honcho init failed ({e}), using local fallback")
            self._client = None

    @property
    def _using_honcho(self) -> bool:
        return self._client is not None and self._session_id is not None

    def remember(self, content: str, category: str = "fact") -> None:
        entry = {
            "content": content,
            "category": category,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if self._using_honcho:
            try:
                self._client.apps.users.sessions.messages.create(  # type: ignore
                    app_id=self._app_id,
                    user_id=self._user_id,
                    session_id=self._session_id,
                    is_user=True,
                    content=json.dumps(entry),
                )
                return
            except Exception as e:
                print(f"[memory] Honcho remember failed ({e})")
        self._local_log.append(entry)
        print(f"[memory] Remembered ({category}): {content[:80]}")

    def recall(self, query: str) -> str:
        if self._using_honcho:
            try:
                result = self._client.apps.users.sessions.chat(  # type: ignore
                    app_id=self._app_id,
                    user_id=self._user_id,
                    session_id=self._session_id,
                    query=query,
                )
                return getattr(result, "content", str(result))
            except Exception as e:
                print(f"[memory] Honcho recall failed ({e})")

        # Fallback: keyword search in local log
        hits = [
            e["content"] for e in self._local_log
            if any(w.lower() in e["content"].lower() for w in query.split())
        ]
        return "\n".join(hits[-5:]) if hits else "No relevant memories found."

    def remember_eval(self, model: str, job_id: str, accuracy: float,
                      n_examples: int, notes: str = "") -> None:
        content = (
            f"Eval result — model={model} job={job_id} "
            f"accuracy={accuracy:.1%} n={n_examples}"
            + (f" notes={notes}" if notes else "")
        )
        self.remember(content, category="eval")

    def remember_training_run(self, job_id: str, base_model: str,
                               dataset: str, status: str, notes: str = "") -> None:
        content = (
            f"Training run — job={job_id} base={base_model} "
            f"dataset={dataset} status={status}"
            + (f" notes={notes}" if notes else "")
        )
        self.remember(content, category="training")

    def dream(self) -> str:
        now = time.time()
        interval = self.config.dream_interval_hours * 3600
        if now - self._last_dream < interval:
            remaining = (interval - (now - self._last_dream)) / 3600
            return f"[memory] Dream skipped — next dream in {remaining:.1f}h"

        self._last_dream = now
        if self._using_honcho:
            try:
                result = self._client.apps.users.sessions.chat(  # type: ignore
                    app_id=self._app_id,
                    user_id=self._user_id,
                    session_id=self._session_id,
                    query=(
                        "Consolidate my memories. What patterns do you see in my "
                        "training runs, eval results, and dataset decisions? "
                        "What should I do differently next time?"
                    ),
                )
                summary = getattr(result, "content", str(result))
                self.remember(f"[dream] {summary}", category="dream")
                return summary
            except Exception as e:
                print(f"[memory] Honcho dream failed ({e})")

        if not self._local_log:
            return "[memory] No memories to consolidate yet."

        evals = [e for e in self._local_log if e["category"] == "eval"]
        runs = [e for e in self._local_log if e["category"] == "training"]
        summary = (
            f"[dream] {len(self._local_log)} total memories: "
            f"{len(runs)} training runs, {len(evals)} eval results. "
            f"Latest: {self._local_log[-1]['content'][:120]}"
        )
        self._local_log.append({"content": summary, "category": "dream",
                                 "timestamp": datetime.utcnow().isoformat()})
        return summary

    def bridge_session(self, query: str = "What happened last session?") -> str:
        return self.recall(query)

    def status(self) -> dict[str, Any]:
        return {
            "backend": "honcho" if self._using_honcho else "local",
            "workspace": self.config.workspace_id,
            "peer": self.config.peer_name,
            "local_entries": len(self._local_log),
            "session_id": self._session_id,
        }


if __name__ == "__main__":
    mem = AgentMemory()
    mem.remember("Test memory entry from clawd training pipeline")
    print(mem.recall("test memory"))
    print(mem.status())
