# Dark Agent

Automation and policy lane for the Dark wallet workspace.

This folder holds the agent-mode surface descriptions and guardrail defaults
used by the wallet UI.

## Exports

- `DARK_AGENT_SURFACES`
- `DARK_AGENT_PROMPT`
- `getDarkAgentSurface(mode)`

Use these helpers to drive the policy UI without exposing private state or
secret inputs.
