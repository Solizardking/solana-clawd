#!/usr/bin/env python3
"""
Clawd Solana RPC Client — 8-command Solana data tool.

Adapted from the Hermes Blockchain/Solana skill for the Clawd agent ecosystem.
Uses only Python standard library (urllib, json, argparse) plus optional Helius DAS.

8 commands:
  wallet   <address>           SOL balance + SPL token portfolio with USD values
  tx       <signature>         Full transaction details with balance changes
  token    <mint_address>      SPL token metadata, price, supply, top holders
  activity <address>           Recent transaction history (default: 10)
  nft      <address>           NFT portfolio (SPL + optional Helius cNFT)
  whales   [--min-sol N]       Large SOL transfers in most recent block
  stats                        Network health: slot, epoch, TPS, SOL price
  price    <mint_or_symbol>    Quick price lookup by mint or known symbol

Environment:
  SOLANA_RPC_URL   Override default public RPC (recommended: Helius, QuickNode)
  HELIUS_API_KEY   Enables Helius DAS for cNFTs, richer token data (optional)

Usage:
  python3 scripts/solana_client.py stats
  python3 scripts/solana_client.py wallet 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
  python3 scripts/solana_client.py price SOL
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any

# ── Config ──────────────────────────────────────────────────────────────────────

DEFAULT_RPC = "https://api.mainnet-beta.solana.com"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
HELIUS_BASE = "https://mainnet.helius-rpc.com"

KNOWN_SYMBOLS: dict[str, str] = {
    "SOL":  "So11111111111111111111111111111111111111112",
    "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "JUP":  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "WIF":  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    "MEW":  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
    "JTO":  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwjx2ZEfchqd",
    "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    "WEN":  "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk",
    "DRIFT":"DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",
    "TNSR": "TNSRxcUxoT9xBG3de7A4QJ6SpkNMX1wfJ2MZCcNnqLG",
    "BOME": "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82",
    "PENGU":"2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",
    "WETH": "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    "mSOL": "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    "stSOL":"7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj",
    "bSOL": "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    "JLP":  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
    "HNT":  "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
    "RNDR": "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
    "W":    "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ",
    "CLAWD":"8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
}

COINGECKO_IDS: dict[str, str] = {
    "So11111111111111111111111111111111111111112": "solana",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "usd-coin",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "tether",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "bonk",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": "jupiter-exchange-solana",
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": "dogwifcoin",
    "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7": "drift-protocol",
    "jtojtomepa8beP8AuQc6eXt5FriJwfFMwjx2ZEfchqd": "jito-governance-token",
    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": "pyth-network",
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": "marinade-staked-sol",
}


# ── HTTP helpers ─────────────────────────────────────────────────────────────────

def _fetch(url: str, data: bytes | None = None, headers: dict | None = None, retries: int = 2) -> Any:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries:
                time.sleep(2 ** attempt)
                continue
            raise
        except Exception:
            if attempt < retries:
                time.sleep(1)
                continue
            raise
    return None


def rpc(method: str, params: list | None = None, endpoint: str | None = None) -> Any:
    url = endpoint or os.environ.get("SOLANA_RPC_URL", DEFAULT_RPC)
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    result = _fetch(url, data=payload, headers={"Content-Type": "application/json"})
    if result and "error" in result:
        raise RuntimeError(f"RPC error {method}: {result['error']}")
    return result.get("result") if result else None


def coingecko(path: str, params: dict | None = None) -> Any:
    qs = "&".join(f"{k}={v}" for k, v in (params or {}).items())
    url = f"{COINGECKO_BASE}/{path}?{qs}" if qs else f"{COINGECKO_BASE}/{path}"
    try:
        return _fetch(url)
    except Exception:
        return None


def helius_das(method: str, params: dict | None = None) -> Any:
    api_key = os.environ.get("HELIUS_API_KEY", "")
    if not api_key:
        return None
    url = f"{HELIUS_BASE}/?api-key={api_key}"
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": [params or {}]}).encode()
    try:
        result = _fetch(url, data=payload, headers={"Content-Type": "application/json"})
        return result.get("result") if result else None
    except Exception:
        return None


# ── Formatters ───────────────────────────────────────────────────────────────────

def lamports(n: int | None) -> float:
    return (n or 0) / 1e9


def fmt_sol(n: float) -> str:
    return f"{n:,.4f} SOL"


def fmt_usd(n: float) -> str:
    if n >= 1_000_000:
        return f"${n/1_000_000:.2f}M"
    if n >= 1_000:
        return f"${n:,.2f}"
    return f"${n:.4f}"


def short(s: str, n: int = 12) -> str:
    return f"{s[:6]}...{s[-4:]}" if len(s) > n else s


# ── Price helpers ────────────────────────────────────────────────────────────────

def get_sol_price() -> float:
    data = coingecko("simple/price", {"ids": "solana", "vs_currencies": "usd"})
    return float(data["solana"]["usd"]) if data and "solana" in data else 0.0


def get_token_price_usd(mint: str) -> float:
    cg_id = COINGECKO_IDS.get(mint, "")
    if not cg_id:
        return 0.0
    data = coingecko("simple/price", {"ids": cg_id, "vs_currencies": "usd"})
    return float(data[cg_id]["usd"]) if data and cg_id in data else 0.0


# ── Commands ─────────────────────────────────────────────────────────────────────

def cmd_wallet(address: str, limit: int = 20, show_all: bool = False, no_prices: bool = False) -> None:
    print(f"\n🦞 CLAWD — Wallet: {short(address, 20)} ({address})\n")

    # SOL balance
    result = rpc("getBalance", [address])
    sol_balance = lamports(result.get("value", 0) if result else 0)
    sol_price = 0.0 if no_prices else get_sol_price()
    sol_usd = sol_balance * sol_price
    print(f"  SOL Balance   {fmt_sol(sol_balance):<20} {fmt_usd(sol_usd)}")

    # SPL token accounts
    result = rpc("getTokenAccountsByOwner", [
        address,
        {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
        {"encoding": "jsonParsed"},
    ])
    accounts = result.get("value", []) if result else []

    tokens = []
    for acct in accounts:
        info = acct.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
        mint = info.get("mint", "")
        balance_raw = int(info.get("tokenAmount", {}).get("amount", "0"))
        decimals = info.get("tokenAmount", {}).get("decimals", 0)
        amount = balance_raw / (10 ** decimals) if decimals else balance_raw
        if amount <= 0 and not show_all:
            continue
        tokens.append({"mint": mint, "amount": amount, "decimals": decimals})

    # Resolve known names
    name_map = {v: k for k, v in KNOWN_SYMBOLS.items()}

    # Price enrichment
    total_token_usd = 0.0
    enriched = []
    for t in tokens:
        price = 0.0
        if not no_prices:
            try:
                price = get_token_price_usd(t["mint"])
                time.sleep(0.1)  # CoinGecko rate limit
            except Exception:
                pass
        usd = t["amount"] * price
        total_token_usd += usd
        enriched.append({**t, "price": price, "usd": usd, "name": name_map.get(t["mint"], short(t["mint"]))})

    enriched.sort(key=lambda x: x["usd"], reverse=True)
    dust = [t for t in enriched if t["usd"] < 0.01 and not show_all]
    display = [t for t in enriched if t["usd"] >= 0.01 or show_all][:limit]

    print(f"\n  SPL Tokens ({len(enriched)} total, {len(dust)} dust filtered)")
    print(f"  {'Token':<12} {'Amount':>18} {'Price':>12} {'Value':>12}")
    print(f"  {'─'*12} {'─'*18} {'─'*12} {'─'*12}")
    for t in display:
        amt = f"{t['amount']:,.4f}"
        price_str = fmt_usd(t["price"]) if t["price"] else "—"
        usd_str = fmt_usd(t["usd"]) if t["usd"] else "—"
        print(f"  {t['name']:<12} {amt:>18} {price_str:>12} {usd_str:>12}")

    print(f"\n  Portfolio Total: {fmt_usd(sol_usd + total_token_usd)}")
    print(f"  (SOL: {fmt_usd(sol_usd)} + Tokens: {fmt_usd(total_token_usd)})\n")


def cmd_tx(signature: str) -> None:
    print(f"\n🦞 CLAWD — Transaction: {short(signature, 20)}\n")
    result = rpc("getTransaction", [signature, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}])
    if not result:
        print("  Transaction not found (may be pruned from public RPC history).")
        return

    meta = result.get("meta", {})
    block_time = result.get("blockTime")
    slot = result.get("slot")
    fee = lamports(meta.get("fee", 0))
    err = meta.get("err")
    status = "✅ Success" if not err else f"❌ Failed: {err}"

    ts = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(block_time)) if block_time else "unknown"
    print(f"  Slot:       {slot}")
    print(f"  Timestamp:  {ts}")
    print(f"  Status:     {status}")
    print(f"  Fee:        {fmt_sol(fee)}")

    # Balance changes
    pre = meta.get("preBalances", [])
    post = meta.get("postBalances", [])
    accounts = result.get("transaction", {}).get("message", {}).get("accountKeys", [])
    sol_price = get_sol_price()
    changes = []
    for i, (p, q) in enumerate(zip(pre, post)):
        delta = lamports(q - p)
        if abs(delta) > 0.000001:
            addr = accounts[i] if isinstance(accounts[i], str) else accounts[i].get("pubkey", "?")
            changes.append((short(addr), delta))

    if changes:
        print(f"\n  Balance Changes:")
        print(f"  {'Account':<20} {'Delta SOL':>14} {'USD':>12}")
        print(f"  {'─'*20} {'─'*14} {'─'*12}")
        for addr, delta in changes:
            sign = "+" if delta > 0 else ""
            usd = fmt_usd(abs(delta) * sol_price)
            print(f"  {addr:<20} {sign}{fmt_sol(delta):>14} {usd:>12}")

    # Programs invoked
    ixs = result.get("transaction", {}).get("message", {}).get("instructions", [])
    programs = list({ix.get("programId", ix.get("program", "?")) for ix in ixs if isinstance(ix, dict)})
    if programs:
        print(f"\n  Programs Invoked:")
        for p in programs[:5]:
            print(f"    {short(p if isinstance(p, str) else str(p), 44)}")
    print()


def cmd_token(mint: str) -> None:
    mint = KNOWN_SYMBOLS.get(mint.upper(), mint)
    print(f"\n🦞 CLAWD — Token: {mint}\n")

    # Mint info
    result = rpc("getAccountInfo", [mint, {"encoding": "jsonParsed"}])
    info = result.get("value", {}).get("data", {}).get("parsed", {}).get("info", {}) if result else {}
    decimals = info.get("decimals", 0)
    supply_raw = int(info.get("supply", 0))
    supply = supply_raw / (10 ** decimals)
    mint_auth = info.get("mintAuthority") or "null (burned)"
    freeze_auth = info.get("freezeAuthority") or "null (burned)"

    print(f"  Mint:         {mint}")
    print(f"  Decimals:     {decimals}")
    print(f"  Supply:       {supply:,.0f}")
    print(f"  Mint auth:    {mint_auth}")
    print(f"  Freeze auth:  {freeze_auth}")

    # Price
    price = get_token_price_usd(mint)
    if price:
        market_cap = price * supply
        print(f"  Price:        {fmt_usd(price)}")
        print(f"  Market cap:   {fmt_usd(market_cap)}")

    # Top holders via Helius DAS (optional)
    das_result = helius_das("getTokenLargestAccounts", {"mint": mint})
    if not das_result:
        # Fallback: public RPC
        result2 = rpc("getTokenLargestAccounts", [mint])
        das_result = result2.get("value", []) if result2 else []

    if das_result:
        print(f"\n  Top Holders:")
        for i, h in enumerate(das_result[:5], 1):
            addr = h.get("address", "?")
            amt = float(h.get("uiAmount", 0))
            pct = (amt / supply * 100) if supply > 0 else 0
            print(f"    {i}. {short(addr)}  {amt:,.2f}  ({pct:.1f}%)")
    print()


def cmd_activity(address: str, limit: int = 10) -> None:
    limit = min(limit, 25)
    print(f"\n🦞 CLAWD — Activity: {short(address, 20)}\n")
    result = rpc("getSignaturesForAddress", [address, {"limit": limit}])
    sigs = result if isinstance(result, list) else []
    print(f"  {'#':<4} {'Signature':<20} {'Status':<12} {'Time'}")
    print(f"  {'─'*4} {'─'*20} {'─'*12} {'─'*24}")
    for i, s in enumerate(sigs, 1):
        sig = short(s.get("signature", "?"), 20)
        err = s.get("err")
        status = "✅" if not err else "❌"
        bt = s.get("blockTime")
        ts = time.strftime("%m-%d %H:%M", time.gmtime(bt)) if bt else "—"
        print(f"  {i:<4} {sig:<20} {status:<12} {ts}")
    print()


def cmd_nft(address: str) -> None:
    print(f"\n🦞 CLAWD — NFT Portfolio: {short(address, 20)}\n")

    # Standard SPL NFTs (amount=1, decimals=0)
    result = rpc("getTokenAccountsByOwner", [
        address,
        {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
        {"encoding": "jsonParsed"},
    ])
    accounts = result.get("value", []) if result else []
    nfts = []
    for acct in accounts:
        info = acct.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
        ta = info.get("tokenAmount", {})
        if int(ta.get("amount", 0)) == 1 and ta.get("decimals", 1) == 0:
            nfts.append(info.get("mint", "?"))

    print(f"  SPL NFTs (standard): {len(nfts)}")
    for mint in nfts[:10]:
        print(f"    {short(mint)}")
    if len(nfts) > 10:
        print(f"    ... and {len(nfts)-10} more")

    # Helius DAS cNFTs (optional)
    das = helius_das("getAssetsByOwner", {"ownerAddress": address, "page": 1, "limit": 50})
    if das and "items" in das:
        cnfts = [a for a in das["items"] if a.get("compression", {}).get("compressed")]
        print(f"\n  Compressed NFTs (Helius DAS): {len(cnfts)}")
        for a in cnfts[:5]:
            name = a.get("content", {}).get("metadata", {}).get("name", short(a.get("id", "?")))
            print(f"    {name}")
    else:
        print("\n  (Set HELIUS_API_KEY to detect compressed NFTs / cNFTs)")
    print()


def cmd_whales(min_sol: float = 500.0) -> None:
    print(f"\n🦞 CLAWD — Whale Detector (min {min_sol:.0f} SOL in latest block)\n")
    slot_result = rpc("getSlot")
    if not slot_result:
        print("  Could not fetch current slot.")
        return
    block = rpc("getBlock", [slot_result, {
        "encoding": "jsonParsed",
        "maxSupportedTransactionVersion": 0,
        "transactionDetails": "full",
        "rewards": False,
    }])
    if not block:
        print("  Could not fetch block.")
        return

    sol_price = get_sol_price()
    found = 0
    for tx in (block.get("transactions") or []):
        meta = tx.get("meta", {})
        pre = meta.get("preBalances", [])
        post = meta.get("postBalances", [])
        for p, q in zip(pre, post):
            delta = lamports(abs(q - p))
            if delta >= min_sol:
                sig = tx.get("transaction", {}).get("signatures", ["?"])[0]
                print(f"  {short(sig)}  {fmt_sol(delta):<20} {fmt_usd(delta * sol_price)}")
                found += 1
                break

    if found == 0:
        print(f"  No transfers >= {min_sol:.0f} SOL found in slot {slot_result}.")
    print()


def cmd_stats() -> None:
    print("\n🦞 CLAWD — Solana Network Stats\n")

    # Basic info
    epoch_result = rpc("getEpochInfo")
    slot = epoch_result.get("absoluteSlot", "?") if epoch_result else "?"
    epoch = epoch_result.get("epoch", "?") if epoch_result else "?"

    # Supply
    supply_result = rpc("getSupply")
    circulating = lamports(supply_result.get("value", {}).get("circulating", 0)) if supply_result else 0

    # Recent perf
    perf = rpc("getRecentPerformanceSamples", [1])
    tps = 0.0
    if perf and isinstance(perf, list) and perf:
        s = perf[0]
        sample_period = s.get("samplePeriodSecs", 60)
        tx_count = s.get("numTransactions", 0)
        tps = tx_count / sample_period if sample_period else 0

    # Version
    ver = rpc("getVersion")
    version = ver.get("solana-core", "?") if ver else "?"

    # Price
    sol_price = get_sol_price()
    market_cap = sol_price * circulating

    print(f"  Slot:           {slot:,}")
    print(f"  Epoch:          {epoch}")
    print(f"  TPS (recent):   {tps:,.0f}")
    print(f"  Circulating:    {circulating:,.0f} SOL")
    print(f"  SOL Price:      {fmt_usd(sol_price)}")
    print(f"  Market Cap:     {fmt_usd(market_cap)}")
    print(f"  Version:        {version}")
    print()


def cmd_price(mint_or_symbol: str) -> None:
    mint = KNOWN_SYMBOLS.get(mint_or_symbol.upper(), mint_or_symbol)
    cg_id = COINGECKO_IDS.get(mint)

    if cg_id:
        data = coingecko("coins/markets", {
            "vs_currency": "usd",
            "ids": cg_id,
            "price_change_percentage": "24h,7d",
        })
        if data and len(data) > 0:
            d = data[0]
            name = d.get("name", mint_or_symbol)
            price = d.get("current_price", 0)
            change24h = d.get("price_change_percentage_24h", 0)
            change7d = d.get("price_change_percentage_7d_in_currency", 0)
            mcap = d.get("market_cap", 0)
            vol = d.get("total_volume", 0)
            print(f"\n🦞 CLAWD — {name} ({mint_or_symbol.upper()})")
            print(f"  Price:     {fmt_usd(price)}")
            sign24 = "+" if change24h > 0 else ""
            sign7 = "+" if change7d > 0 else ""
            print(f"  24h:       {sign24}{change24h:.2f}%")
            print(f"  7d:        {sign7}{change7d:.2f}%")
            print(f"  Mkt Cap:   {fmt_usd(mcap)}")
            print(f"  Volume:    {fmt_usd(vol)}")
            print()
            return

    # Fallback: simple price
    price = get_token_price_usd(mint)
    if price:
        print(f"\n  {mint_or_symbol.upper()}: {fmt_usd(price)}\n")
    else:
        print(f"\n  Price not found for {mint_or_symbol} (not in CoinGecko index).\n")
        print(f"  Use `token {mint}` for on-chain supply / holder info.\n")


# ── CLI ───────────────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    wp = sub.add_parser("wallet", help="SOL balance + SPL token portfolio")
    wp.add_argument("address")
    wp.add_argument("--limit", type=int, default=20, help="Max tokens to show (default: 20)")
    wp.add_argument("--all", dest="show_all", action="store_true", help="Show all tokens including dust")
    wp.add_argument("--no-prices", action="store_true", help="Skip CoinGecko lookups (faster)")

    tp = sub.add_parser("tx", help="Full transaction details")
    tp.add_argument("signature")

    tok = sub.add_parser("token", help="SPL token metadata + price + top holders")
    tok.add_argument("mint", help="Mint address or known symbol (BONK, JUP, SOL ...)")

    act = sub.add_parser("activity", help="Recent transaction history")
    act.add_argument("address")
    act.add_argument("--limit", type=int, default=10)

    nft = sub.add_parser("nft", help="NFT portfolio (SPL + cNFT if HELIUS_API_KEY set)")
    nft.add_argument("address")

    wh = sub.add_parser("whales", help="Large SOL transfers in latest block")
    wh.add_argument("--min-sol", type=float, default=500.0)

    sub.add_parser("stats", help="Network stats: slot, epoch, TPS, SOL price")

    pr = sub.add_parser("price", help="Quick price lookup")
    pr.add_argument("token", help="Mint address or symbol (SOL, BONK, JUP ...)")

    args = p.parse_args()

    try:
        if args.cmd == "wallet":
            cmd_wallet(args.address, limit=args.limit, show_all=args.show_all, no_prices=args.no_prices)
        elif args.cmd == "tx":
            cmd_tx(args.signature)
        elif args.cmd == "token":
            cmd_token(args.mint)
        elif args.cmd == "activity":
            cmd_activity(args.address, limit=args.limit)
        elif args.cmd == "nft":
            cmd_nft(args.address)
        elif args.cmd == "whales":
            cmd_whales(min_sol=args.min_sol)
        elif args.cmd == "stats":
            cmd_stats()
        elif args.cmd == "price":
            cmd_price(args.token)
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(0)
    except Exception as e:
        print(f"\n[ERROR] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
