#!/usr/bin/env python3
"""
Test script for Hermes Blockchain Oracle - Solana Client
Tests the SolanaClient directly (not via MCP).

Usage:
    python test_oracle.py
"""

import asyncio
import sys
import os
import json
from pathlib import Path

# Add the src directory to sys.path so imports work from project root
project_root = Path(__file__).resolve().parent
src_dir = project_root / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

# Known active Solana addresses for testing
TOLY_ADDRESS = "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdRrbukKM"
SOLANA_FOUNDATION = "GK2zqSsXLA2rwVZk347RYhh6jJXRsAkGhUfnMFCmuMk1"

SEPARATOR = "=" * 60


def print_header(title: str):
    print()
    print(SEPARATOR)
    print(f"  {title}")
    print(SEPARATOR)


def print_result(data, indent: int = 2):
    """Pretty-print a result, handling dicts, lists, strings, etc."""
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                print(f"{' ' * indent}{key}:")
                print_result(value, indent + 4)
            else:
                print(f"{' ' * indent}{key}: {value}")
    elif isinstance(data, list):
        for i, item in enumerate(data):
            if isinstance(item, (dict, list)):
                print(f"{' ' * indent}[{i}]:")
                print_result(item, indent + 4)
            else:
                print(f"{' ' * indent}- {item}")
    elif isinstance(data, str):
        # Try to parse as JSON for pretty display
        try:
            parsed = json.loads(data)
            print_result(parsed, indent)
        except (json.JSONDecodeError, TypeError):
            print(f"{' ' * indent}{data}")
    else:
        print(f"{' ' * indent}{data}")


async def test_network_stats(client):
    """Test 1: Solana network stats (no address needed, should always work)."""
    print_header("TEST 1: Solana Network Stats")
    try:
        # Try common method signatures
        if hasattr(client, 'solana_network_stats'):
            result = await client.solana_network_stats()
        elif hasattr(client, 'get_network_stats'):
            result = await client.get_network_stats()
        elif hasattr(client, 'network_stats'):
            result = await client.network_stats()
        else:
            print("  [ERROR] Could not find network stats method on SolanaClient")
            print(f"  Available methods: {[m for m in dir(client) if not m.startswith('_')]}")
            return False

        print("  [OK] Network stats retrieved successfully!")
        print()
        print_result(result)
        return True
    except Exception as e:
        print(f"  [ERROR] Failed to get network stats: {type(e).__name__}: {e}")
        return False


async def test_wallet_info(client, address: str, label: str):
    """Test 2/3: Solana wallet info for a known address."""
    print_header(f"TEST: Wallet Info - {label}")
    print(f"  Address: {address}")
    print()
    try:
        # Try common method signatures
        if hasattr(client, 'solana_wallet_info'):
            result = await client.solana_wallet_info(address)
        elif hasattr(client, 'get_wallet_info'):
            result = await client.get_wallet_info(address)
        elif hasattr(client, 'wallet_info'):
            result = await client.wallet_info(address)
        else:
            print("  [ERROR] Could not find wallet info method on SolanaClient")
            print(f"  Available methods: {[m for m in dir(client) if not m.startswith('_')]}")
            return False

        print("  [OK] Wallet info retrieved successfully!")
        print()
        print_result(result)
        return True
    except Exception as e:
        print(f"  [ERROR] Failed to get wallet info: {type(e).__name__}: {e}")
        return False


async def main():
    print(SEPARATOR)
    print("  Hermes Blockchain Oracle - Solana Client Tests")
    print(SEPARATOR)
    print()
    print(f"Project root: {project_root}")
    print(f"Source dir:   {src_dir}")

    # --- Import SolanaClient ---
    print()
    print("Importing SolanaClient...")
    try:
        from hermes_blockchain_oracle.solana_client import SolanaClient
        print("  [OK] SolanaClient imported successfully")
    except ImportError as e:
        print(f"  [FAIL] Import error: {e}")
        print()
        print("Make sure the project is set up correctly:")
        print(f"  - src dir exists: {src_dir.exists()}")
        pkg_dir = src_dir / "hermes_blockchain_oracle"
        print(f"  - package dir exists: {pkg_dir.exists()}")
        if pkg_dir.exists():
            print(f"  - package contents: {list(pkg_dir.iterdir())}")
        sys.exit(1)

    # --- Instantiate client ---
    print("Creating SolanaClient instance...")
    try:
        client = SolanaClient()
        print("  [OK] SolanaClient created")
    except TypeError:
        # Maybe it needs arguments; try with common RPC URL
        try:
            client = SolanaClient("https://api.mainnet-beta.solana.com")
            print("  [OK] SolanaClient created (with mainnet RPC URL)")
        except Exception as e2:
            print(f"  [FAIL] Could not create SolanaClient: {e2}")
            sys.exit(1)
    except Exception as e:
        print(f"  [FAIL] Could not create SolanaClient: {e}")
        sys.exit(1)

    print(f"  Available methods: {[m for m in dir(client) if not m.startswith('_')]}")

    # --- Run Tests ---
    results = []

    # Test 1: Network stats
    passed = await test_network_stats(client)
    results.append(("Network Stats", passed))

    # Test 2: Wallet info - Toly's address
    passed = await test_wallet_info(client, TOLY_ADDRESS, "Toly (Anatoly Yakovenko)")
    results.append(("Wallet Info (Toly)", passed))

    # Test 3: Wallet info - Solana Foundation
    passed = await test_wallet_info(client, SOLANA_FOUNDATION, "Solana Foundation")
    results.append(("Wallet Info (Solana Foundation)", passed))

    # --- Cleanup ---
    # Close client session if applicable
    for method_name in ('close', 'aclose', 'cleanup', 'disconnect'):
        if hasattr(client, method_name):
            try:
                closer = getattr(client, method_name)
                if asyncio.iscoroutinefunction(closer):
                    await closer()
                else:
                    closer()
            except Exception:
                pass
            break

    # --- Summary ---
    print_header("TEST SUMMARY")
    total = len(results)
    passed_count = sum(1 for _, p in results if p)
    failed_count = total - passed_count

    for name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"  {status} {name}")

    print()
    print(f"  Total: {total} | Passed: {passed_count} | Failed: {failed_count}")
    print()

    if failed_count > 0:
        print("  Some tests failed. Check output above for details.")
        sys.exit(1)
    else:
        print("  All tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
