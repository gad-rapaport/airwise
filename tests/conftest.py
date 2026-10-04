from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import pytest

from airwise.catalog import LOCATIONS, Location
from airwise.config import Settings

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "data" / "snapshot" / "open-meteo-air-quality.json"
BASE = "https://provider.test"


class FakeClock:
    """Controls both monotonic time (resilience) and wall time (freshness) in tests."""

    def __init__(self, start: float = 1_790_000_000.0) -> None:
        self.t = start
        self.sleeps: list[float] = []

    def now(self) -> float:
        return self.t

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.t += seconds

    def advance(self, seconds: float) -> None:
        self.t += seconds


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        provider_mode="live",
        provider_base_url=BASE,  # type: ignore[arg-type]
        provider_max_retries=2,
        provider_backoff_base_s=0.5,
        provider_max_calls_per_minute=50,
        circuit_failure_threshold=3,
        circuit_open_s=300,
        scheduler_enabled=False,
        db_path=tmp_path / "airwise.db",
        snapshot_path=SNAPSHOT,
    )


def make_payload(
    locations: Sequence[Location] = LOCATIONS,
    start: int = 1_789_000_000 - 1_789_000_000 % 3600,
    hours: int = 48,
    value: Callable[[int, int], float | None] = lambda loc_index, hour: 10.0 + loc_index + hour % 5,
) -> list[dict[str, Any]]:
    """A provider-shaped response with predictable values."""
    out = []
    for i, loc in enumerate(locations):
        times = [start + h * 3600 for h in range(hours)]
        series = [value(i, h) for h in range(hours)]
        out.append(
            {
                "latitude": round(loc.latitude, 1),
                "longitude": round(loc.longitude, 1),
                "generationtime_ms": 1.2,
                "utc_offset_seconds": 0,
                "timezone": "GMT",
                "hourly_units": {
                    "time": "unixtime",
                    "pm2_5": "μg/m³",
                    "pm10": "μg/m³",
                    "nitrogen_dioxide": "μg/m³",
                    "ozone": "μg/m³",
                    "european_aqi": "EAQI",
                },
                "hourly": {
                    "time": times,
                    "pm2_5": series,
                    "pm10": series,
                    "nitrogen_dioxide": series,
                    "ozone": series,
                    "european_aqi": series,
                },
            }
        )
    return out
