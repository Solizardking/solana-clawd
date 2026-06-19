# cuFOLIO Pointer

The local cuFOLIO source snapshot lives at:

```text
../../trading_factory/cufolio/
```

This directory exists so the NVIDIA blueprint layout has a stable cuFOLIO
anchor without duplicating the repository. The Solana adapter uses
`trading_factory/solana_factory/cufolio_adapter.py` and emits
`data/strategies/cufolio_mean_cvar_handoff.json`.
