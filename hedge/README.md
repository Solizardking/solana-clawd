# @openclawd/hedge

Hedge persona set for OpenClawd agents.

## Local Personas

- `activistpinch.json`
- `latticeclaw.json`
- `moatmaw.json`
- `soltoshi.json`
- `valueclaw.json`

## Canonical Character Sources

The investor and Wonderland character files stay in `../agents/characters/`.
`index.json` points at those canonical files so `/hedge` can be used as a small
bundle without duplicating character definitions.

## Validate

```bash
jq . *.json
```
