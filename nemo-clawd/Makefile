.PHONY: check lint format lint-ts lint-py format-ts format-py docs docs-live docs-clean

check: lint-ts lint-py
	@echo "All checks passed."

lint: lint-ts lint-py

lint-ts:
	cd nemo-clawd-mcp && npm run lint

lint-py:
	cd nemo-clawd-python && $(MAKE) check

format: format-ts format-py

format-ts:
	cd nemo-clawd-mcp && npm run lint

format-py:
	cd nemo-clawd-python && $(MAKE) format

# --- Documentation ---

docs:
	uv run --group docs sphinx-build -b html docs docs/_build/html

docs-live:
	uv run --group docs sphinx-autobuild docs docs/_build/html --open-browser

docs-clean:
	rm -rf docs/_build
