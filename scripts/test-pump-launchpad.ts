import assert from "node:assert/strict";
import { PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  AmmRoute,
  CurveRoute,
  LaunchKind,
} from "../shared/cheshire-launchpad/sdk";
import {
  PUMP_BUYBACK_FEE_RECIPIENTS,
  PUMP_NORMAL_FEE_RECIPIENTS,
  buildPumpLaunchTransaction,
  buildPumpTradeTransaction,
} from "../server/lib/pump/index";
import {
  CHESHIRE_LAUNCHPAD_PROGRAM_ENV_KEYS,
} from "../server/lib/launchpad/registry";
import {
  CLAWD_CONSTITUTION_HASH_ENV_KEYS,
  CLAWD_PROTOCOL_PROGRAM_ENV_KEYS,
  hashClawdConstitution,
} from "../server/lib/launchpad/clawd-sdk";

const originalEnv = { ...process.env };
const user = new PublicKey("HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ");
const creator = new PublicKey("EFH1ouVP6ikYgyHm9zaLXSPHJDXsfVcaVLFPjtzw6BbF");
const cheshireProgram = new PublicKey("FrooSFQWh5uiTCtLgEGBthCkRwQ69Laq7tf9Kaqn3R8G");
const clawdProgram = new PublicKey("CLAWDpRoToCoLv1pRoGRaM111111111111111111111");
const blockhash = "11111111111111111111111111111111";

function resetEnv() {
  process.env = { ...originalEnv };
  for (const key of [
    ...CHESHIRE_LAUNCHPAD_PROGRAM_ENV_KEYS,
    ...CLAWD_PROTOCOL_PROGRAM_ENV_KEYS,
    ...CLAWD_CONSTITUTION_HASH_ENV_KEYS,
  ]) {
    delete process.env[key];
  }
}

try {
  resetEnv();
  process.env.CHESHIRE_LAUNCHPAD_PROGRAM_ID = cheshireProgram.toBase58();
  process.env.CLAWD_PROTOCOL_PROGRAM_ID = clawdProgram.toBase58();
  process.env.CLAWD_AGENT_CONSTITUTION_SHA256 = Buffer.from(hashClawdConstitution("pump launchpad test")).toString("hex");

  const launch = await buildPumpLaunchTransaction({
    name: "Cheshire Pump Agent",
    symbol: "CHPUMP",
    uri: "https://example.com/chpump.json",
    userWallet: user.toBase58(),
    creator: creator.toBase58(),
    launchRegistry: { enabled: true },
    clawdAgentBinding: {
      enabled: true,
      agentWallet: user,
      authority: user,
      character: { name: "Cheshire Pump Agent", symbol: "CHPUMP" },
    },
    blockhash,
  });

  assert.equal(launch.userWallet, user.toBase58());
  assert.equal(launch.creator, creator.toBase58());
  assert.equal(launch.tokenProgram, TOKEN_2022_PROGRAM_ID.toBase58());
  assert.equal(launch.quoteMint, NATIVE_MINT.toBase58());
  assert.equal(launch.launchRegistry?.launchKind, LaunchKind.AgentToken);
  assert.equal(launch.launchRegistry?.curveRoute, CurveRoute.PumpSynthetic);
  assert.equal(launch.launchRegistry?.ammRoute, AmmRoute.PumpSwap);
  assert.equal(launch.clawdAgentBinding?.programId, clawdProgram.toBase58());
  assert.equal(launch.transactions.length, 2);

  const launchTx = Transaction.from(Buffer.from(launch.transactions[0], "base64"));
  assert.equal(launchTx.feePayer?.toBase58(), user.toBase58());
  assert.equal(launchTx.recentBlockhash, blockhash);
  assert.equal(launchTx.instructions.length, 2);
  const metadataTx = Transaction.from(Buffer.from(launch.transactions[1], "base64"));
  assert.equal(metadataTx.feePayer?.toBase58(), user.toBase58());
  assert.equal(metadataTx.recentBlockhash, blockhash);
  assert.equal(metadataTx.instructions.length, 3);

  const buy = await buildPumpTradeTransaction({
    side: "buy",
    mint: launch.mintAddress,
    userWallet: user.toBase58(),
    creator: creator.toBase58(),
    amount: "1000000",
    quoteAmount: "100000000",
    tokenProgram: "token-2022",
    quoteMint: NATIVE_MINT.toBase58(),
    quoteTokenProgram: "spl-token",
    mayhemMode: false,
    blockhash,
  });
  assert.equal(buy.side, "buy");
  assert.equal(buy.tokenProgram, TOKEN_2022_PROGRAM_ID.toBase58());
  assert.equal(buy.quoteTokenProgram, TOKEN_PROGRAM_ID.toBase58());
  assert.ok(PUMP_NORMAL_FEE_RECIPIENTS.includes(buy.feeRecipient as any));
  assert.ok(PUMP_BUYBACK_FEE_RECIPIENTS.includes(buy.buybackFeeRecipient as any));
  const buyTx = Transaction.from(Buffer.from(buy.transaction, "base64"));
  assert.equal(buyTx.instructions.length, 4);

  const sell = await buildPumpTradeTransaction({
    side: "sell",
    mint: launch.mintAddress,
    userWallet: user.toBase58(),
    creator: creator.toBase58(),
    amount: "1000000",
    quoteAmount: "0",
    tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
    quoteMint: NATIVE_MINT.toBase58(),
    quoteTokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    mayhemMode: false,
    blockhash,
  });
  assert.equal(sell.side, "sell");
  assert.equal(sell.quoteAmount, "0");
  const sellTx = Transaction.from(Buffer.from(sell.transaction, "base64"));
  assert.equal(sellTx.instructions.length, 4);

  console.log("pump launchpad smoke tests passed");
} finally {
  resetEnv();
}
