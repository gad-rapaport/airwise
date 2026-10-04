# Exercises

Run `./scripts/ops.ps1 test` after each change.

## 1. Add a pollutant: carbon monoxide

- **Change:** add `carbon_monoxide` to `PROVIDER_UNITS` and `METRICS` in [catalog.py](../src/airwise/catalog.py)
  and to the `Hourly` model in [schema.py](../src/airwise/provider/schema.py); recapture the snapshot.
- **Verify:** schema tests pass on the new snapshot; the radio button appears; the API test's metric set is updated.

## 2. Treat a slow provider differently from a dead one

- **Change:** in [client.py](../src/airwise/provider/client.py) stop retrying after a read timeout if the
  total elapsed time exceeds 15 s.
- **Verify:** a respx test with `side_effect=httpx.ReadTimeout` and a fake clock that advances 8 s per attempt
  makes exactly 2 attempts.

## 3. Alert when data is stale

- **Change:** add `"alert": true` to `/api/status` when the freshness state is `stale` or `expired` for more
  than 6 hours, and log one warning per transition.
- **Verify:** service test using the fake clock; the warning is logged once, not on every read.

## 4. Per-city daily means

- **Change:** pass each location's own time zone (already in the catalog) to `daily_means` in
  [service.py](../src/airwise/service.py).
- **Verify:** a unit test where Athens and Tel Aviv buckets differ by one hour; the table header explains the zones.

## 5. Pipeline: fail on a new Trivy finding

- **Change:** add `--exit-code 1` to the Trivy step in [ci.yml](../.github/workflows/ci.yml) with a justified
  `.trivyignore`.
- **Verify:** the e2e job fails when an ignore entry is removed.
