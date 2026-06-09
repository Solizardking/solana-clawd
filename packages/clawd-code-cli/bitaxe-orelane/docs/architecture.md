# Architecture

## Reality check

The repos you referenced lead to a specific technical shape:

- `bitaxeGamma` is the hardware platform.
- `ESP-Miner` is the actual `esp32s3` firmware target.
- The ORE codebase you provided is board-based mining with `deploy`, `checkpoint`, `claim`, and `automate`.

So the architecture is:

1. Bitcoin plane
   The BM1370 ASIC continues Bitcoin mining through Stratum exactly as Bitaxe already does.

2. ORE plane
   A Clawd-style controller reads ORE board state, miner state, and wallet balance, then decides whether to:
   - deploy,
   - checkpoint,
   - claim,
   - hold.

3. Safety plane
   Bitaxe telemetry gates ORE execution. If the board is hot, CPU-starved, memory-starved, or WiFi is degraded, the controller holds instead of risking miner uptime.

4. Clawd plane
   `clawd.json` exposes this controller as a public Clawd agent contract. It is intentionally paper-first and requires explicit live-execution gates before it can submit ORE actions.

## Two deployment modes

### 1. Off-board controller with on-board relay

Recommended first.

- Run the TypeScript controller on a local host, SBC, or workstation.
- Read Bitaxe data from AxeOS `/api/system/info`.
- Execute ORE through `ore-cli`.
- Optionally push signed ORE bundles to the Bitaxe over a small `orelane` firmware API.

This keeps private keys off the ESP32 while still making the Bitaxe part of the control loop.

### 2. On-board controller inside ESP-Miner

Ambitious but viable as a second step.

- Add a FreeRTOS `orelane` task to ESP-Miner.
- Mirror a small subset of miner telemetry into an ORE control snapshot.
- Accept signed ORE action bundles through an HTTP API or a BAP channel.
- Dispatch those bundles only if safety gates pass.

This gives you a true single-device rig, but it should still avoid storing the Solana hot key in flash.

## Why not direct dual hashing

Bitaxe Bitcoin work is done in the ASIC. ORE in your tree is not ASIC-compatible SHA-256 work. It is a Solana transaction strategy problem. The shared device opportunity is the controller plane, not the hash engine.

## Safety gates

The prototype holds ORE actions when any of these are true:

- chip temp above `BITAXE_MAX_TEMP_C`
- CPU usage above `BITAXE_MAX_CPU`
- free heap below `BITAXE_MIN_FREE_HEAP`
- WiFi RSSI below `BITAXE_MIN_RSSI`
- `miningPaused=true`

That means ORE never takes priority over BTC availability.

## Why the current controller uses sequential deploys

Your local `ore-miner` TypeScript app expects a `deploy_mask` command, but the `cli/src/main.rs` you provided does not expose that command. This workspace avoids blocking on that mismatch by splitting one multi-square intent into several single-square `deploy` calls.

That is less efficient than a native multi-square instruction path, but it works today against the CLI you actually have.

## Current live target

The controller defaults to the live Bitaxe the user provided:

- `http://192.168.1.174/`

The x402 ORE app is tracked as the ORE operator surface:

- `https://x402.wtf/ore`

That page currently behaves like a browser app, not a simple JSON API, so the controller still reads ORE chain state directly through Solana RPC and uses the local `ore-cli` for actions.

## Verified live status

The live Bitaxe at `http://192.168.1.174/` responds through AxeOS and is healthy:

- board `602`
- firmware / AxeOS `v2.10.1`
- BM1370 Gamma ASIC
- pool `public-pool.io`
- approximately `788 GH/s` during the latest check
- approximately `16.7 W`
- approximately `54.4 C`
- WiFi around `-52 dBm`

The current ORE RPC endpoint is not usable for live reads yet because it returned `429 Too Many Requests` / `max usage reached`.

## Production next steps

1. Add JSON output mode to `ore-cli` to remove stdout parsing and manual inspection.
2. Add a native multi-square deploy command to `ore-cli`.
3. Choose key custody:
   - remote signer,
   - delegated executor,
   - secure element.
4. Wire the `orelane` firmware task into upstream `ESP-Miner`.
5. Add a Clawd catalog agent surface once you settle the final execution model.
6. Install ESP-IDF and build an actual `.bin` firmware image from the patched `ESP-Miner` tree.
