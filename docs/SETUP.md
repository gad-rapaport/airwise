# Setup

## Requirements

| Purpose | Requirement |
| --- | --- |
| Run | Docker with Compose v2 (PowerShell 7 for `scripts/ops.ps1`, optional) |
| Develop | Python 3.14, [uv](https://docs.astral.sh/uv/) 0.12, Node.js 24 |
| E2E | `cd web; npx playwright install chromium` once |

Port **8102** on `127.0.0.1` (demo) and 8002 / 5182 for local development.
Live mode needs outbound HTTPS to `air-quality-api.open-meteo.com`; snapshot mode needs no network.

## Configuration

All settings are `AIRWISE_*` environment variables, validated at start-up ([config.py](../src/airwise/config.py)).
No value is secret. The most useful ones:

| Variable | Default | Meaning |
| --- | --- | --- |
| `AIRWISE_PROVIDER_MODE` | `live` | `snapshot` serves the bundled data only |
| `AIRWISE_FRESH_TTL_S` | `1800` | Age at which data counts as due for refresh |
| `AIRWISE_REFRESH_INTERVAL_S` | `3600` | Scheduler interval (±10 % jitter) |
| `AIRWISE_PROVIDER_MAX_CALLS_PER_MINUTE` | `6` | Local call budget |
| `AIRWISE_CIRCUIT_FAILURE_THRESHOLD`, `AIRWISE_CIRCUIT_OPEN_S` | `3`, `300` | Circuit breaker |
| `AIRWISE_DISPLAY_TIMEZONE` | `Asia/Jerusalem` | Axis labels and daily buckets |
| `AIRWISE_DB_PATH` | `data/airwise.db` (`/data/airwise.db` in the container) | SQLite file |
| `AIRWISE_SCHEDULER_ENABLED` | `true` | Background refresh loop |

## Run with Docker

```powershell
./scripts/ops.ps1 setup
```

or, without PowerShell: `cp .env.example .env && docker compose up -d --build --wait`.

There is no seed step: the first read fetches live data, or loads the snapshot if the provider is unreachable
or snapshot mode is on. `./scripts/ops.ps1 seed` loads the snapshot explicitly (an idempotent upsert).

## Develop

```powershell
uv sync                                    # creates .venv from uv.lock
cd web; npm ci; npm run build; cd ..       # web build that the API serves
$env:AIRWISE_WEB_DIST = 'web/dist'
uv run uvicorn airwise.main:create_app --factory --host 127.0.0.1 --port 8002
# optional hot-reloading UI on 127.0.0.1:5182, proxying /api to 8002:
cd web; npm run dev
```

## Verify

```powershell
./scripts/ops.ps1 status     # container healthy, freshness and circuit state
curl http://127.0.0.1:8102/api/status
```
