# Testing

## Strategy

| Layer | Tool | Proves | Uses the real provider? |
| --- | --- | --- | --- |
| Contract | pytest | The recorded real response passes the schema; each kind of contract violation is rejected | Recorded response only |
| Client failures | pytest + respx, fake clock | Retries, backoff bounds, timeouts, 429 with short and long Retry-After, 4xx not retried, budget, circuit breaker open and half-open | No (mocked HTTP) |
| Service | pytest + respx | Single-flight (20 concurrent refreshes, 1 upstream call), snapshot fallback, stale data served and flagged, no calls while fresh, background refresh, cooldown, retention, refresh log, scheduler decisions | No |
| Processing | pytest | Daily mean coverage rule, missing hours, window bounds, EAQI bands, null gaps | No |
| API | FastAPI TestClient | Shapes, validation errors, security headers, request id sanitising, health | Snapshot mode |
| Operations | pytest | SQLite backup and restore round trip; foreign files refused | No |
| Web unit | Vitest | Y domain incl. guideline, forecast split, nearest point, time-zone aligned ticks, label collision avoidance | No |
| E2E | Playwright + axe-core | Main flows on desktop and phone, keyboard reading of the chart, 4-location limit, URL state, no console errors, no serious accessibility violations | Local runs: live; CI: snapshot mode |

The clock is injected everywhere time matters (`now`, `sleep`, `wall`), so backoff and cooldown tests run in
milliseconds and are deterministic.

## Commands

```powershell
./scripts/ops.ps1 test             # ruff, mypy, pytest, web format/lint/types/unit
uv run pytest
cd web; npm test
cd web; npm run test:e2e           # needs the stack: ./scripts/ops.ps1 start
```

## Results (2026-10-04, local)

| Suite | Result |
| --- | --- |
| pytest | 59 passed in 5.2 s |
| Vitest | 16 passed |
| Playwright, live mode | 7 passed |
| Playwright, snapshot mode on a fresh volume | 7 passed |
| ruff, ruff format, mypy --strict | clean |

### Drills on the Docker stack

- **Provider outage** (`ops.ps1 outage-on`, provider host set to an `.invalid` name): the next read returned
  stored data immediately and started a background refresh; the refresh made 3 attempts and failed with
  `network: ConnectError`; the banner showed the error; a manual refresh was accepted once and then answered
  429 with `Retry-After: 119`. `outage-off` restored live data.
- **Backup and restore:** backup taken (refresh log 6 rows), a manual refresh added a 7th row, restore returned
  it to 6 rows and the app became healthy again.

### Latency (60 sequential requests, Docker Desktop, 4-core laptop)

| Endpoint | p50 | p95 |
| --- | --- | --- |
| `/api/series`, 4 locations, 72 h hourly | 4.2 ms | 6.7 ms |
| `/api/series`, 4 locations, 7 days daily | 5.9 ms | 7.1 ms |
| `/api/summary` | 5.4 ms | 6.9 ms |

## Gaps

- No load test of concurrent readers against a slow provider beyond the single-flight unit test.
- E2E in CI runs only in snapshot mode; the live path is covered by mocked tests and local runs.
- Starlette's test client prints a deprecation warning about its HTTP client; it does not affect results.
