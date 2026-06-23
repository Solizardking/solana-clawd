"""Quick test for the Solana client."""
import asyncio
import sys
import json

sys.path.insert(0, "src")
from hermes_blockchain_oracle.solana_client import SolanaClient


async def test():
    client = SolanaClient()
    failures = 0

    print("=" * 50)
    print("  TEST 1: Solana Network Stats")
    print("=" * 50)
    try:
        stats = await client.get_network_stats()
        print(json.dumps(stats, indent=2))
        print(">> PASS")
    except Exception as e:
        print(f">> FAIL: {e}")
        failures += 1

    print()
    print("=" * 50)
    print("  TEST 2: Wallet Info (Toly)")
    print("=" * 50)
    try:
        wallet = await client.get_wallet_info(
            "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdRrbukKM"
        )
        print(json.dumps(wallet, indent=2))
        print(">> PASS")
    except Exception as e:
        print(f">> FAIL: {e}")
        failures += 1

    print()
    print("=" * 50)
    print("  TEST 3: Token Info (CLAWD)")
    print("=" * 50)
    try:
        token = await client.get_token_info(client.clawd_token)
        print(json.dumps(token, indent=2))
        print(">> PASS")
    except Exception as e:
        print(f">> FAIL: {e}")
        failures += 1

    print()
    print("=" * 50)
    print("  TEST 4: Token Info (BONK)")
    print("=" * 50)
    try:
        token = await client.get_token_info(
            "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
        )
        print(json.dumps(token, indent=2))
        print(">> PASS")
    except Exception as e:
        print(f">> FAIL: {e}")
        failures += 1

    await client.close()
    print()
    if failures:
        print(f"{failures} test(s) failed.")
        raise SystemExit(1)
    print("All tests passed!")


if __name__ == "__main__":
    asyncio.run(test())
