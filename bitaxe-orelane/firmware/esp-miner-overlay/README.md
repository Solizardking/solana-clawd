# ESP-Miner Overlay

This folder shows how to embed an `orelane` task into upstream `ESP-Miner`.

## Intent

`orelane` is the on-device half of the hybrid system:

- mirrors Bitaxe miner telemetry into an ORE control snapshot,
- exposes a tiny HTTP API for status and signed bundle delivery,
- drives an optional WS2812/SK6812-style base LED color cycle,
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
- call `orelane_led_start();`
- register `orelane_register_http_routes(server);` from the existing HTTP server bootstrap

The best lifecycle point is after WiFi and the REST server are live, but before the main mining loop is fully settled, so the control plane starts early without blocking ASIC bring-up.

Apply the overlay to a local ESP-Miner checkout:

```bash
cd /Users/8bit/Downloads/solana-clawd/bitaxe-orelane
firmware/esp-miner-overlay/install.sh /absolute/path/to/ESP-Miner
```

Then build normally with ESP-IDF. If `idf.py` is not found, source your ESP-IDF export script first:

```bash
source "$HOME/esp/esp-idf/export.sh"
cd /absolute/path/to/ESP-Miner
idf.py build
```

Or build with upstream ESP-Miner's dev container if you do not want ESP-IDF installed on the host:

```bash
cd /absolute/path/to/ESP-Miner
docker build -t espminer-build .devcontainer
docker run --rm -it -v "$PWD:/workspace" espminer-build /bin/bash
cd /workspace
idf.py build
```

## Base LED Control

The overlay registers:

- `GET /api/orelane/led` — current LED state
- `PATCH /api/orelane/led` — set LED mode

Solid color:

```bash
curl -X PATCH "http://BITAXE-IP/api/orelane/led" \
  -H "Content-Type: application/json" \
  -d '{"mode":"solid","red":255,"green":0,"blue":128,"brightnessPercent":18}'
```

On-device color cycle:

```bash
curl -X PATCH "http://BITAXE-IP/api/orelane/led" \
  -H "Content-Type: application/json" \
  -d '{"mode":"cycle","brightnessPercent":18}'
```

The GPIO, LED count, brightness, and cycle interval are configured in ESP-Miner `menuconfig` under `Bitaxe Configuration -> ORELANE Base LED`. Defaults are `GPIO=21`, `count=8`, `brightness=18%`, and `cycle=700ms`; change GPIO/count to match your base hardware before flashing.

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
