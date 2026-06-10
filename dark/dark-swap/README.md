# Dark Swap

Quote and routing lane for the Dark wallet workspace.

This folder provides the token map and route estimator that the wallet UI uses
for previewing swaps.

## Exports

- `DARK_SWAP_TOKENS`
- `DARK_SWAP_ROUTES`
- `estimateDarkSwap(inputToken, outputToken, inputAmount, slippageBps?)`
- `pickDarkSwapRoute(inputToken, outputToken)`

The wallet uses these helpers for static route previews without needing live
pricing secrets.
