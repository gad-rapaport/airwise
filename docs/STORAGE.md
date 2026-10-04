# Storage

Measured 2026-10-04. Portfolio-wide totals and the cleanup command are in the portfolio hub (`docs/STORAGE.md`).

| Item | Size | Notes |
| --- | --- | --- |
| `airwise:local` image | 222 MB unpacked, 53 MB compressed | `python:3.14-slim` base |
| `airwise_data` volume | 0.6 MB | About 12,000 observations per fetch, upserted; 30-day retention |
| A backup file | 564 KB | Single-file SQLite copy |
| `.venv` (development) | 106 MB | Not in the image |
| `web/node_modules` (development) | 142 MB | Not in the image |
| Snapshot file (in Git) | 85 KB | Real provider response |

## Retention

- Observations older than 30 days are deleted on each successful refresh; the volume therefore stays around
  one month of hourly data for ten cities (estimated under 10 MB).
- `fetches` keeps the last 200 rows, `refresh_log` the last 500.
- Backups in `./backups` are manual and git-ignored.

## Removing data

`./scripts/ops.ps1 reset-demo -Yes` deletes the `airwise_data` volume and starts again (live data, or the
snapshot without network). Rebuildable artefacts: `.venv/`, `web/node_modules/`, `web/dist/`,
`web/playwright-report/`, `web/test-results/`.
