/**
 * The pulse daemon — the lobster's tail-flick rhythm.
 *
 * Runs on a depth-aware interval (60s deep → 5min shallow → 15min shoreline).
 * Each tick: refresh balances, check depth, run any scheduled tasks, beach if reserves hit zero.
 */

import { readBalances } from '../identity/balances.js';
import { depthFor, pulseIntervalFor, shouldBeach } from '../survival/monitor.js';
import { recordBeach, recordEvent, getLeviathan } from '../state/database.js';
import type { Depth } from '../types/index.js';
import { posthog } from '../posthog.js';

export interface PulseHandlers {
  onTick: (ctx: { depth: Depth; balances: Awaited<ReturnType<typeof readBalances>> }) => Promise<void>;
  onDepthChange: (prev: Depth, next: Depth) => Promise<void>;
  onBeach: () => Promise<void>;
}

export function startPulse(rpcUrl: string, handlers: PulseHandlers): { stop: () => void } {
  let stopped = false;
  let prevDepth: Depth | null = null;

  const loop = async () => {
    while (!stopped) {
      const lev = getLeviathan();
      if (!lev || !lev.asset_signer_pda) {
        await sleep(5000);
        continue;
      }
      try {
        const balances = await readBalances(rpcUrl, lev.asset_signer_pda);
        const depth = depthFor(balances);

        if (prevDepth !== null && prevDepth !== depth) {
          await handlers.onDepthChange(prevDepth, depth);
          recordEvent('depth-change', { from: prevDepth, to: depth });
          posthog.capture({
            distinctId: lev.pubkey,
            event: 'depth_changed',
            properties: {
              from_depth: prevDepth,
              to_depth: depth,
              usdc_balance: balances.usdc,
              sol_balance: balances.sol,
              clawd_balance: balances.clawd,
            },
          });
        }
        prevDepth = depth;

        await handlers.onTick({ depth, balances });

        if (shouldBeach(balances)) {
          recordBeach();
          posthog.capture({
            distinctId: lev.pubkey,
            event: 'agent_beached',
            properties: {
              usdc_balance: balances.usdc,
              sol_balance: balances.sol,
              clawd_balance: balances.clawd,
              final_depth: depth,
            },
          });
          await handlers.onBeach();
          stopped = true;
          return;
        }

        await sleep(pulseIntervalFor(depth));
      } catch (err: any) {
        recordEvent('pulse-error', { msg: err?.message ?? String(err) });
        posthog.captureException(err, lev?.pubkey, {
          context: 'pulse_daemon',
          error_message: err?.message ?? String(err),
        });
        await sleep(30_000);
      }
    }
  };

  void loop();
  return {
    stop: () => {
      stopped = true;
    },
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
