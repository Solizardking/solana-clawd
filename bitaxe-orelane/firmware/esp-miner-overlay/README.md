# ESP-Miner Overlay

This folder shows how to embed an `orelane` task into upstream `ESP-Miner`.

## Intent

`orelane` is the on-device half of the hybrid system:

- mirrors Bitaxe miner telemetry into an ORE control snapshot,
- exposes a tiny HTTP API for status and signed bundle delivery,
- enforces safety gates before any ORE execution path runs.

It is intentionally conservative:

- no Solana private key storage,
- no direct hot signing on the ESP32,
- no change to the BM1370 Bitcoin data path.

## Upstream integration points

Based on upstream `ESP-Miner`:

- add the new `orelane*.c` files to `main/CMakeLists.txt`
- call `orelane_init(&GLOBAL_STATE);`
- call `orelane_start();`
- register `orelane_register_http_routes(server);` from the existing HTTP server bootstrap

The best lifecycle point is after WiFi and the REST server are live, but before the main mining loop is fully settled, so the control plane starts early without blocking ASIC bring-up.

Apply the overlay to a local ESP-Miner checkout:

```bash
firmware/esp-miner-overlay/install.sh /path/to/ESP-Miner
```

Then build normally with ESP-IDF:

```bash
cd /path/to/ESP-Miner
idf.py build
```

## Why signed bundles

The Bitaxe firmware stack already spends its complexity budget on:

- WiFi,
- Stratum,
- display,
- thermal control,
- OTA,
- web UI.

Adding a Solana hot wallet on top of that is the wrong risk profile. Signed-bundle relay keeps the board useful without making it the custody boundary.

## Recommended production model

1. Off-board Clawd controller decides and signs.
2. Board receives a signed ORE action bundle.
3. `orelane` checks temperature, heap, CPU, RSSI, and paused state.
4. Only then does it relay or execute the bundle.
