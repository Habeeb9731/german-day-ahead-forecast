.PHONY: all setup ingest clean-data qc features backtest export dashboard sample dev test lint

# Run the whole pipeline from a fresh clone, then build the dashboard on the results.
# The first run takes about 2 hours, because the weather backfill respects API rate limits.
all: setup ingest clean-data qc features backtest export dashboard

setup:
	cd pipeline && uv sync
	cd dashboard && npm ci

ingest:
	cd pipeline && uv run epf ingest-smard && uv run epf ingest-holidays && uv run epf ingest-weather

clean-data:
	cd pipeline && uv run epf clean

qc:
	cd pipeline && uv run epf qc

features:
	cd pipeline && uv run epf build-features

backtest:
	cd pipeline && uv run epf backtest

export:
	cd pipeline && uv run epf export

dashboard:
	cd dashboard && npm run build

# Local development with clearly labelled synthetic data. No API calls are needed.
sample:
	mkdir -p dashboard/public/data
	cd dashboard && npm run sample

dev:
	cd dashboard && npm run dev

test:
	cd pipeline && uv run pytest -m "not live"
	cd dashboard && npm test

lint:
	cd pipeline && uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy
	cd dashboard && npm run lint && npm run typecheck
