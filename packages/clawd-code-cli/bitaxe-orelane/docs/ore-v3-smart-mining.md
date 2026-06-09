# ORE v3 Smart Mining Guide

This guide captures the practical ORE v3 rules that matter for a live miner/controller.

## ORE v3 Mechanics

- Each round lasts about 60 seconds.
- Each round has 25 squares: `0` through `24`.
- Miners deploy SOL to chosen squares.
- One winning square is selected when the round closes.
- Winning squares receive ORE rewards and recover their deployed SOL.
- Losing squares forfeit deployed SOL.

### Simple Win Probability

- `1` square: `4%` chance per round
- `3` squares: `12%` chance per round
- `5` squares: `20%` chance per round

These are probability figures, not profit guarantees. Variance matters.

## Timing Rules

The deployment window is the first hard gate.

- Deploy only when the round has roughly `5` to `55` seconds remaining.
- Avoid the last `5` seconds of a round.
- Avoid deploy attempts before the round is actually active.

The common failure mode is straightforward: a deploy is submitted after the round has already closed.

## Smart Mining Flow

The controller should follow this order:

1. Read board state and current slot.
2. If the round is closed, wait for the next round.
3. If the round is active but under `5` seconds remain, skip and wait.
4. If the round is active and inside the safe window, evaluate wallet reserve and square selection.
5. Deploy to the chosen squares.
6. Re-check miner state for checkpoint or claim conditions.

## Recommended Profiles

### Conservative

- Squares per round: `1`
- Cost per round: `0.01 SOL`
- Win rate: `4%`
- Use when testing or protecting capital.

### Balanced

- Squares per round: `3`
- Cost per round: `0.03 SOL`
- Win rate: `12%`
- Good default for regular operation.

### Aggressive

- Squares per round: `5`
- Cost per round: `0.05 SOL`
- Win rate: `20%`
- Higher variance, higher burn rate.

## Checkpointing

Checkpointing is not optional forever.

- Use checkpointing to prevent stale miner state from blocking rewards.
- A practical cadence is every `5` rounds, or sooner if the miner reports checkpoint needed.
- Claim only after thresholds are hit, rather than every round, to reduce overhead.

## Risk Management

- Keep a reserve of at least `0.1 SOL` for fees and retries.
- Expect losing streaks. A `12%` win rate can still lose many rounds in sequence.
- Do not equate win rate with profitability. ORE token value and round reward size matter.
- Bound session loss. The controller should enforce reserve-based stopping behavior.

## How This Maps To Bitaxe Orelane

In this repo, the ORE controller already follows the general decision loop:

- `deploy`
- `checkpoint`
- `claim`
- `hold`

The production direction is:

- only deploy in the safe round window,
- preserve wallet reserve,
- prefer empty or underbet squares,
- checkpoint when miner state is behind,
- never let ORE activity degrade Bitcoin uptime.

## Operational Notes

- The current controller reads ORE chain state directly and shells out to `ore-cli` for actions.
- Multi-square deploy is currently implemented as sequential single-square deploys.
- The Telegram bot should explain this strategy clearly, but keep deploy execution gated unless live execution is intentionally armed.
