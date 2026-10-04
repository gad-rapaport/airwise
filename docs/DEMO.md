# Demo script (4 minutes)

Before: `./scripts/ops.ps1 start` (live) and open http://127.0.0.1:8102. Without internet use snapshot mode;
everything below works except step 4.

## 1. Product (30 s)

"Airwise compares air quality across ten cities using an open API. The interesting part is not the chart but
what happens between us and the provider." Point at the banner: source, age, state.

## 2. Exploring data (60 s)

- Switch to NO₂, then 7 days and Daily mean. "Daily means are computed by us, in one time zone, and only for
  days with at least 18 hours of data."
- Toggle Table: same data, accessible. Tab into the chart and press arrow keys: values are read out.
- Try to select a fifth city: disabled, with the reason.

## 3. Provider contract (45 s)

Open [provider/schema.py](../src/airwise/provider/schema.py): "Nothing reaches the database unless the whole
payload is valid. The tests run this schema against a real recorded response and against each kind of
violation."

## 4. Failure live (60 s)

- `./scripts/ops.ps1 outage-on`, wait a minute, reload: data still there, banner now shows the provider error.
- Open "Data source and service status": failed refreshes with 3 attempts each, circuit state.
- Click "Refresh from provider" twice: the second answer is a cooldown.
- `./scripts/ops.ps1 outage-off`.

## 5. Close (25 s)

Show [DECISIONS.md#cache-policy](DECISIONS.md#cache-policy): one request for all cities, 30-minute
freshness, hourly schedule, about 240 of the 10,000 free daily calls.

## Decisions worth presenting

| Decision | Alternative | Why |
| --- | --- | --- |
| Stale-while-revalidate from SQLite | Fetch on every request | Reads never wait for or overload the provider |
| Single-flight refresh | Lock or nothing | N readers, one upstream call, no lost work on disconnect |
| In-house breaker and budget | Resilience library | Small, tested, behaviour is visible |
| Snapshot mode | Mock server in CI | Real data, offline demos, contract test fixture |

## Limitations and next steps

Model data, not stations; single provider; no per-client rate limit on reads. Next: a second provider for
cross-checking, alerting on prolonged staleness, per-city daily means in each city's own time zone.
