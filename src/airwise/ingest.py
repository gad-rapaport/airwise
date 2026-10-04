"""Turns a validated provider payload into internal observation rows, and loads the committed snapshot."""

import hashlib
import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from airwise.catalog import PROVIDER_UNITS, Location
from airwise.provider.schema import ProviderPayload
from airwise.store import Row

# Open-Meteo snaps coordinates to its model grid; anything further than this means a mismatched response.
MAX_GRID_OFFSET_DEG = 0.5


class MappingError(ValueError):
    pass


def to_rows(payload: ProviderPayload, locations: Sequence[Location]) -> list[Row]:
    if len(payload.root) != len(locations):
        raise MappingError(f"expected {len(locations)} locations, got {len(payload.root)}")
    rows: list[Row] = []
    for loc, data in zip(locations, payload.root, strict=True):
        # The provider answers in request order; verify instead of trusting it blindly.
        if (
            abs(data.latitude - loc.latitude) > MAX_GRID_OFFSET_DEG
            or abs(data.longitude - loc.longitude) > MAX_GRID_OFFSET_DEG
        ):
            raise MappingError(f"response coordinates do not match {loc.id}")
        hourly = data.hourly
        for metric in PROVIDER_UNITS:
            values: list[float | None] = getattr(hourly, metric)
            for ts, value in zip(hourly.time, values, strict=True):
                clean = None if value is None or not math.isfinite(value) else round(float(value), 2)
                rows.append((loc.id, metric, ts, clean))
    return rows


def payload_digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


@dataclass(frozen=True)
class Snapshot:
    payload: ProviderPayload
    raw: bytes
    captured_at: float
    location_ids: list[str]


def load_snapshot(path: Path) -> Snapshot:
    """The snapshot file holds the provider's raw JSON plus capture metadata (see data/snapshot/README.md)."""
    doc = json.loads(path.read_bytes())
    raw = json.dumps(doc["response"]).encode()
    return Snapshot(
        payload=ProviderPayload.model_validate(doc["response"]),
        raw=raw,
        captured_at=float(doc["captured_at_unix"]),
        location_ids=list(doc["location_ids"]),
    )
