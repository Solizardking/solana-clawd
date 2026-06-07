# ABOUTME: OpenClawd Operator package for AI agent orchestration
# ABOUTME: Implements the Llobster Legend operator loop with multi-tool support

"""OpenClawd Operator - Solana-native AI agent orchestration."""

__version__ = "0.1.0"

OPENCLAWD_OPERATOR_IDENTITY = {
    "platform": "OpenClawd",
    "operator": "Llobster Legend",
    "tagline": "Autonomous trading agents for Solana DeFi",
    "symbol": "$CLAWD",
    "token": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
}

try:
    from .orchestrator import RalphOrchestrator
    from .metrics import Metrics, CostTracker, IterationStats
    from .error_formatter import ClaudeErrorFormatter, ErrorMessage
    from .verbose_logger import VerboseLogger
    from .output import DiffStats, DiffFormatter, RalphConsole
except ImportError:
    from src.ralph_orchestrator.orchestrator import RalphOrchestrator
    from src.ralph_orchestrator.metrics import Metrics, CostTracker, IterationStats
    from src.ralph_orchestrator.error_formatter import ClaudeErrorFormatter, ErrorMessage
    from src.ralph_orchestrator.verbose_logger import VerboseLogger
    from src.ralph_orchestrator.output import DiffStats, DiffFormatter, RalphConsole

__all__ = [
    "RalphOrchestrator",
    "Metrics",
    "CostTracker",
    "IterationStats",
    "ClaudeErrorFormatter",
    "ErrorMessage",
    "VerboseLogger",
    "DiffStats",
    "DiffFormatter",
    "RalphConsole",
    "OPENCLAWD_OPERATOR_IDENTITY",
]
