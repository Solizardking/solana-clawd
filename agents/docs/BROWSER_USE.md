# Browser Use for Solana Clawd

This page defines the Browser Use integration pattern for Solana Clawd. Use the Solana Clawd names and paths below in our docs and UI; do not publish configs that contain an expanded `BROWSER_USE_API_KEY`.

## Server-Side Agent Sessions

Cheshire Terminal proxies Browser Use Cloud through the protected backend route:

```bash
BROWSER_USE_API_KEY=...
BROWSER_USE_MODEL=claude-sonnet-4.6
```

The browser never receives `BROWSER_USE_API_KEY` directly. The backend sends it to Browser Use with the `X-Browser-Use-API-Key` header and exposes only authenticated Solana Clawd routes to registered or token-gated users.

Use the app at `/computer` for:

- Solana Clawd natural-language browsing through `/api/browser-use/clawd/run`
- direct Browser Use task sessions through `/api/browser-use/sessions`
- live preview embeds from `https://live.browser-use.com`
- raw CDP browser sessions for Playwright, Puppeteer, or human-in-the-loop flows

## CDP Profile

For private Solana Clawd operators that need to attach to a Browser Use cloud browser via CDP, use this profile shape. Keep the real key in an environment file or secret manager.

```json5
{
  browser: {
    enabled: true,
    defaultProfile: "browser-use",
    remoteCdpTimeoutMs: 3000,
    remoteCdpHandshakeTimeoutMs: 5000,
    profiles: {
      "browser-use": {
        cdpUrl: "wss://connect.browser-use.com?apiKey=<BROWSER_USE_API_KEY>&proxyCountryCode=us",
        color: "#8b5cf6"
      }
    }
  }
}
```

Supported useful query params:

- `timeout`: session duration in minutes, max 240
- `profileId`: Browser Use profile id for persistent cookies and localStorage
- `proxyCountryCode`: residential proxy country, for example `us`, `de`, or `jp`

## CLI Skill

If an agent needs the Browser Use CLI directly, install it into a private Solana Clawd operator environment:

```bash
curl -fsSL https://browser-use.com/cli/install.sh | bash
browser-use doctor
npx skills add https://github.com/browser-use/browser-use --skill browser-use
```

Prefer the Cheshire backend route for production user traffic because it keeps billing keys server-side and lets Solana Clawd enforce holder, wallet, Clerk, and usage gates before any Browser Use spend.
