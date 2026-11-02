.PHONY: setup ingest clean-data qc test lint

setup:
	cd pipeline && uv sync

ingest:
	cd pipeline && uv run epf ingest-smard && uv run epf ingest-holidays && uv run epf ingest-weather

clean-data:
	cd pipeline && uv run epf clean

qc:
	cd pipeline && uv run epf qc

test:
	cd pipeline && uv run pytest -m "not live"

lint:
	cd pipeline && uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy
