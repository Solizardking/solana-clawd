"""
BigQuery -> SolanaTokenizerPipeline CPT data collector.

Queries bigquery-public-data.crypto_solana_mainnet_us for DEX swap transactions
and exports them as CPT JSONL for the transaction foundation model.

Auth: Application Default Credentials (ADC) only.
  gcloud auth application-default login
  OR export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service_account.json

GCP billing project: $GOOGLE_CLOUD_PROJECT (default: x402-477302)

Usage:
  python3 bigquery_collector.py --probe
  python3 bigquery_collector.py --limit 50000 --days 7
  python3 bigquery_collector.py --mock --limit 500
  python3 bigquery_collector.py --limit 100000 --append \
      --output ../../../../data/tx_foundation_cpt.jsonl

Output: {"text": "<tx_context>...CPT tokens...</tx_context>"} JSONL
"""
from __future__ import annotations
import argparse, hashlib, json, math, os, random, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parents[4]
DATA = ROOT / "data"
BQ_DATASET  = "bigquery-public-data.crypto_solana_mainnet_us"
GCP_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "x402-477302")
WRAP = "<tx_context>\n{}\n</tx_context>"

DEX_PROGRAMS: dict[str, str] = {
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter_v6",
    "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB":  "Jupiter_v4",
    "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY": "Phoenix",
    "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": "Orca_v2",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3sFKDmc":  "Orca_Whirlpool",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium_AMM",
    "5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h": "Raydium_CLMM",
    "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": "Raydium_CPMM",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA":  "SPL_Token",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS": "ATA_Program",
    "MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky":  "Mercurial_Stable",
    "SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ":  "Saber",
}

KNOWN_MINTS: dict[str, str] = {
    "So11111111111111111111111111111111111111112":    "SOL",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB":  "USDT",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN":  "JUP",
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So":  "mSOL",
    "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y68G":  "stSOL",
    "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1":  "bSOL",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": "BONK",
    "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3": "PYTH",
    "jtoJLt3tHqMuiG3HmQPva3xpYs2BNkeCaKQnHHmMGWs":  "JTO",
    "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump": "CLAWD",
}

_DEX_SQL = ", ".join("'" + k + "'" for k in DEX_PROGRAMS)


def _bq_client():
    try:
        from google.cloud import bigquery  # type: ignore
        return bigquery.Client(project=GCP_PROJECT)
    except ImportError:
        raise ImportError("pip install google-cloud-bigquery db-dtypes")


def probe_schema() -> None:
    client = _bq_client()
    print("\n[bq-probe] " + BQ_DATASET + "  project=" + GCP_PROJECT + "\n")
    try:
        sql = (
            "SELECT table_name, column_name, data_type "
            "FROM `" + BQ_DATASET + ".INFORMATION_SCHEMA.COLUMNS` "
            "ORDER BY table_name, ordinal_position"
        )
        rows = list(client.query(sql).result())
        cur = None
        for r in rows:
            if r.table_name != cur:
                cur = r.table_name
                print("\n  TABLE: " + cur)
            print("    " + r.column_name.ljust(40) + " " + r.data_type)
    except Exception as e:
        print("INFORMATION_SCHEMA failed: " + str(e))
        for tbl in ["blocks", "transactions", "instructions", "token_transfers"]:
            try:
                q = client.query("SELECT * FROM `" + BQ_DATASET + "." + tbl + "` LIMIT 0")
                print("\n  TABLE: " + tbl)
                for f in q.result().schema:
                    print("    " + f.name.ljust(40) + " " + f.field_type)
            except Exception as e2:
                print("  TABLE: " + tbl + "  [not found: " + str(e2) + "]")


def _sql_nested(days: int, limit: int) -> str:
    parts = [
        "WITH dex AS (",
        "  SELECT",
        "    t.id AS signature, t.block_slot AS slot, t.block_time,",
        "    COALESCE(t.fee, 0) AS fee_lamports,",
        "    COALESCE(t.status, \'unknown\') AS status,",
        "    ix.program_id, COALESCE(ix.parsed.type, \'\') AS ix_type,",
        "    pre.mint AS mint_pre, post.mint AS mint_post,",
        "    COALESCE(pre.ui_token_amount.ui_amount,  0.0) AS amount_pre,",
        "    COALESCE(post.ui_token_amount.ui_amount, 0.0) AS amount_post,",
        "    COALESCE(post.ui_token_amount.ui_amount",
        "           - pre.ui_token_amount.ui_amount, 0.0) AS delta",
        "  FROM `" + BQ_DATASET + ".transactions` t",
        "  CROSS JOIN UNNEST(t.instructions) AS ix",
        "  LEFT JOIN UNNEST(t.pre_token_balances)  AS pre  ON pre.account_index  = 1",
        "  LEFT JOIN UNNEST(t.post_token_balances) AS post ON post.account_index = 1 AND post.mint = pre.mint",
        "  WHERE t.block_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL " + str(days) + " DAY)",
        "    AND COALESCE(t.status, \'\') = \'Success\'",
        "    AND ix.program_id IN (" + _DEX_SQL + ")",
        ")",
        "SELECT * FROM dex ORDER BY block_time DESC LIMIT " + str(limit),
    ]
    return "\n".join(parts)


def _sql_separate(days: int, limit: int) -> str:
    parts = [
        "SELECT t.id AS signature, t.block_slot AS slot, t.block_time,",
        "  COALESCE(t.fee, 0) AS fee_lamports,",
        "  COALESCE(t.status, \'unknown\') AS status,",
        "  i.program_id, COALESCE(i.instruction_type, i.type, \'\') AS ix_type,",
        "  tt.mint AS mint_pre, CAST(NULL AS STRING) AS mint_post,",
        "  COALESCE(SAFE_CAST(tt.amount AS FLOAT64)",
        "    / POWER(10, COALESCE(tt.decimals, 0)), 0.0) AS amount_pre,",
        "  0.0 AS amount_post, 0.0 AS delta",
        "FROM `" + BQ_DATASET + ".transactions` t",
        "JOIN `" + BQ_DATASET + ".instructions` i ON i.tx_id = t.id",
        "LEFT JOIN `" + BQ_DATASET + ".token_transfers` tt ON tt.tx_id = t.id",
        "WHERE t.block_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL " + str(days) + " DAY)",
        "  AND COALESCE(t.status, \'\') IN (\'Success\', \'success\', \'1\')",
        "  AND i.program_id IN (" + _DEX_SQL + ")",
        "ORDER BY t.block_time DESC LIMIT " + str(limit),
    ]
    return "\n".join(parts)


def _h(s: str, mod: int) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest(), 16) % mod


def _log_bucket(v: float, n: int = 64) -> int:
    if v <= 0:
        return 0
    return max(0, min(n - 1, int(math.log1p(v) * (n / math.log1p(1e12)))))


def _fee_bucket(lam: int, n: int = 32) -> int:
    if lam <= 0:
        return 0
    return max(0, min(n - 1, int(math.log1p(lam / 5000) * (n / math.log1p(200)))))


def row_to_cpt_text(row: dict[str, Any], ts: str) -> str:
    sig      = str(row.get("signature", ""))[:16]
    slot     = int(row.get("slot", 0) or 0)
    fee_lam  = int(row.get("fee_lamports", 0) or 0)
    status   = str(row.get("status", "unknown"))
    prog_id  = str(row.get("program_id", "") or "")
    ix_type  = str(row.get("ix_type", "") or "").strip() or "swap"
    mint_pre = str(row.get("mint_pre",  "") or "")
    mint_post = str(row.get("mint_post", "") or mint_pre)
    amt_pre  = float(row.get("amount_pre",  0) or 0)
    amt_post = float(row.get("amount_post", 0) or 0)
    delta    = float(row.get("delta", 0) or 0)
    ok   = any(x in status.lower() for x in ("success", "1"))
    d    = delta if delta != 0 else (amt_post - amt_pre)
    side = "BUY" if d > 0 else ("SELL" if d < 0 else "SWAP")
    st   = "SUCCESS" if ok else "FAIL"
    tseq = (
        "PROG_" + str(_h(prog_id, 512))
        + " IX_" + ix_type.upper().replace(" ", "_")[:16]
        + " MINT_" + str(_h(mint_pre, 4096))
        + " MINT_" + str(_h(mint_post, 4096))
        + " AMT_" + str(_log_bucket(amt_pre))
        + " AMT_" + str(_log_bucket(amt_post))
        + " FEE_" + str(_fee_bucket(fee_lam))
        + " SLOT_" + str(slot % 128)
        + " SIDE_" + side
        + " STATUS_" + st
    )
    pl = DEX_PROGRAMS.get(prog_id, prog_id[:8] + "...")
    mi = KNOWN_MINTS.get(mint_pre,  mint_pre[:8]  + "..." if mint_pre  else "unknown")
    mo = KNOWN_MINTS.get(mint_post, mint_post[:8] + "..." if mint_post else "unknown")
    body = (
        "BQ Solana mainnet DEX tx [" + ts + "]\n"
        + "Sig: " + sig + "...  Slot: " + str(slot) + "  Fee: " + str(fee_lam) + " lamports\n"
        + "Program: " + pl + "  (" + prog_id[:12] + "...)\n"
        + "Instruction: " + ix_type + "\n"
        + "Token in:  " + mi + "  amount=" + format(amt_pre, ".6f") + "\n"
        + "Token out: " + mo + " amount=" + format(amt_post, ".6f") + "\n"
        + "Status: " + st + "  Side: " + side + "\n"
        + "Tokens: " + tseq
    )
    return WRAP.format(body)


_MOCK_IXT = ["swap", "swapBaseIn", "route", "fill", "exchange", "swapExactTokensForTokens"]


def _mock_rows(n: int) -> list[dict[str, Any]]:
    rng = random.Random(42)
    progs = list(DEX_PROGRAMS.keys())
    mints = list(KNOWN_MINTS.keys())
    base = 280_000_000
    out: list[dict[str, Any]] = []
    for i in range(n):
        mp = rng.choice(mints)
        mq = rng.choice(mints)
        ap = rng.uniform(0.01, 5000.0)
        aq = ap * rng.uniform(0.7, 1.3)
        out.append({
            "signature":    "mock" + format(i, "08x") + rng.randbytes(4).hex(),
            "slot":         base + i * 400,
            "block_time":   datetime.now(timezone.utc),
            "fee_lamports": rng.randint(5000, 25000),
            "status":       "Success",
            "program_id":   rng.choice(progs),
            "ix_type":      rng.choice(_MOCK_IXT),
            "mint_pre":     mp,
            "mint_post":    mq,
            "amount_pre":   ap,
            "amount_post":  aq,
            "delta":        aq - ap,
        })
    return out


def _run_query(client, sql: str) -> "list[dict[str, Any]] | None":
    try:
        return [dict(r) for r in client.query(sql).result()]
    except Exception as e:
        if any(k in str(e) for k in ("not found", "Unrecognized", "Invalid field", "does not have")):
            return None
        raise


def _fetch(limit: int, days: int) -> "list[dict[str, Any]]":
    client = _bq_client()
    rows = _run_query(client, _sql_nested(days, limit))
    if rows is None:
        print("[bq] nested schema not matched -- trying separate-tables variant")
        rows = _run_query(client, _sql_separate(days, limit))
    if rows is None:
        raise RuntimeError("Both SQL variants failed. Run --probe to inspect schema.")
    return rows


def _write(rows: "list[dict[str, Any]]", path: Path, append: bool, ts: str) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("a" if append else "w") as f:
        for row in rows:
            try:
                f.write(json.dumps({"text": row_to_cpt_text(row, ts)}) + "\n")
                n += 1
            except Exception as e:
                print("[bq] skip: " + str(e), file=sys.stderr)
    print("[bq] " + ("appended" if append else "wrote") + " " + str(n) + " -> " + str(path))
    return n


def export_bq(limit: int, days: int, output: Path, append: bool = False) -> int:
    ts = datetime.now(timezone.utc).isoformat()
    print("[bq] project=" + GCP_PROJECT + "  days=" + str(days) + "  limit=" + str(limit))
    rows = _fetch(limit, days)
    print("[bq] " + str(len(rows)) + " rows returned")
    return _write(rows, output, append, ts)


def export_mock(limit: int, output: Path, append: bool = False) -> int:
    ts = datetime.now(timezone.utc).isoformat()
    return _write(_mock_rows(limit), output, append, ts)


def collect_bigquery(count: int, out: list[str]) -> int:
    """collect.py SOURCES entry -- falls back to mock if BQ unavailable."""
    ts   = datetime.now(timezone.utc).isoformat()
    days = int(os.environ.get("BQ_DAYS", "30"))
    try:
        rows = _fetch(count, days)
    except Exception as e:
        print("  [bigquery] BQ unavailable (" + str(e) + ") -- mock fallback", file=sys.stderr)
        rows = _mock_rows(min(count, 500))
    n = 0
    for row in rows[:count]:
        try:
            out.append(json.dumps({"text": row_to_cpt_text(row, ts)}))
            n += 1
        except Exception:
            pass
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--probe",  action="store_true")
    ap.add_argument("--mock",   action="store_true")
    ap.add_argument("--limit",  type=int, default=50_000)
    ap.add_argument("--days",   type=int, default=30)
    ap.add_argument("--output", default=str(DATA / "bq_solana_txs.jsonl"))
    ap.add_argument("--append", action="store_true")
    args = ap.parse_args()
    if args.probe:
        probe_schema()
        sys.exit(0)
    out_path = Path(args.output)
    if args.mock:
        export_mock(args.limit, out_path, args.append)
    else:
        export_bq(args.limit, args.days, out_path, args.append)
