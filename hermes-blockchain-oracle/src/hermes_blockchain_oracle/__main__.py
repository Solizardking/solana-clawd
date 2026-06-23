"""Command-line entrypoint for ``python -m hermes_blockchain_oracle``."""

from __future__ import annotations

import argparse
import logging
import sys

from .server import main


def cli() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m hermes_blockchain_oracle",
        description="Run the Hermes Blockchain Oracle MCP stdio server.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging on stderr.",
    )
    args = parser.parse_args()

    if args.debug:
        logging.basicConfig(
            level=logging.DEBUG,
            stream=sys.stderr,
            format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        )

    main()


if __name__ == "__main__":
    cli()
