"""Capture a fresh offline snapshot from the live provider.

    uv run python scripts/capture_snapshot.py

Makes exactly one provider request (all locations in one call), validates it with the same schema the app
uses, and writes data/snapshot/open-meteo-air-quality.json. Review the diff before committing.
"""

import asyncio
import json
import time
from pathlib import Path

from airwise.catalog import LOCATIONS
from airwise.config import Settings
from airwise.provider.client import ProviderClient, build_params

OUT = Path(__file__).resolve().parent.parent / "data" / "snapshot" / "open-meteo-air-quality.json"


async def main() -> None:
    settings = Settings(provider_mode="live", provider_max_retries=0)
    client = ProviderClient(settings)
    try:
        payload = await client.fetch(LOCATIONS)
    finally:
        await client.aclose()
    doc = {
        "captured_at_unix": int(time.time()),
        "source": "https://air-quality-api.open-meteo.com/v1/air-quality",
        "license": (
            "CC BY 4.0. Data: Open-Meteo Air Quality API, based on Copernicus Atmosphere Monitoring Service."
        ),
        "request_params": build_params(LOCATIONS, settings),
        "location_ids": [loc.id for loc in LOCATIONS],
        "response": json.loads(payload.model_dump_json(exclude_none=False)),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    asyncio.run(main())
