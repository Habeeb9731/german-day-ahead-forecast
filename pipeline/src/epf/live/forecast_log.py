"""Append-only forecast log: one immutable JSON file per delivery date.

Files are created in exclusive mode, so an existing forecast can never be overwritten. Each entry
also stores the hash of the previous entry, which makes later edits or removals detectable.
The log holds model output only. Actual prices are joined later and never written back here.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Literal

Status = Literal["ok", "missed"]


class LogIntegrityError(RuntimeError):
    """The log has been edited, or an entry is missing from the chain."""


@dataclass(frozen=True)
class Entry:
    path: Path
    data: dict[str, Any]

    @property
    def delivery_date(self) -> date:
        return date.fromisoformat(self.data["delivery_date"])


def entry_path(root: Path, delivery: date) -> Path:
    return root / f"{delivery:%Y}" / f"{delivery.isoformat()}.json"


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def entries(root: Path) -> list[Entry]:
    """All entries, oldest delivery first."""
    return [
        Entry(path, json.loads(path.read_text(encoding="utf-8")))
        for path in sorted(root.glob("*/*.json"), key=lambda p: p.name)
    ]


def exists(root: Path, delivery: date) -> bool:
    return entry_path(root, delivery).exists()


def append(
    root: Path,
    delivery: date,
    status: Status,
    generated_at: datetime,
    cutoff: datetime,
    model_version: str | None,
    input_hash: str | None = None,
    reason: str | None = None,
    hours: list[dict[str, Any]] | None = None,
) -> Path:
    """Write one entry. Raises FileExistsError if this delivery date already has one."""
    path = entry_path(root, delivery)
    previous = [e for e in entries(root) if e.delivery_date < delivery]
    payload = {
        "kind": "live_forecast",
        "delivery_date": delivery.isoformat(),
        "status": status,
        "generated_at_utc": generated_at.isoformat(timespec="seconds"),
        "cutoff_utc": cutoff.isoformat(timespec="seconds"),
        "model_version": model_version,
        "input_hash": input_hash,
        "reason": reason,
        "previous_entry_sha256": _digest(previous[-1].path) if previous else None,
        "hours": hours or [],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, indent=1) + "\n")
    return path


def verify(root: Path) -> int:
    """Check every link in the chain and that nothing was generated after its cutoff."""
    items = entries(root)
    for index, item in enumerate(items):
        expected = _digest(items[index - 1].path) if index else None
        if item.data["previous_entry_sha256"] != expected:
            raise LogIntegrityError(f"chain broken at {item.path.name}")
        if item.data["status"] == "ok" and item.data["generated_at_utc"] > item.data["cutoff_utc"]:
            raise LogIntegrityError(f"{item.path.name} was generated after its cutoff")
        if item.path.name != f"{item.data['delivery_date']}.json":
            raise LogIntegrityError(f"{item.path.name} does not match its delivery date")
    return len(items)
