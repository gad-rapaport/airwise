# Changelog

## [0.1.0] - 2026-10-04

First complete release.

### Added

- Open-Meteo Air Quality client with strict schema validation, timeouts, bounded retries with jittered
  backoff, Retry-After handling, local call budget and circuit breaker.
- SQLite store of normalised observations with retention, fetch provenance and refresh history.
- Freshness policy (fresh, aging, stale, expired, snapshot), stale-while-revalidate reads, single-flight
  refresh, scheduled refresh with jitter, manual refresh with cooldown.
- Recorded real snapshot for offline demos and CI.
- API for catalog, series (hourly and daily means), summary and status.
- React interface with accessible SVG chart, data table, EAQI summary cards and status panel.
- Docker image, Compose stack, ops script with backup, restore and an outage drill.
- pytest, Vitest and Playwright suites; CI; manual, disabled deploy workflow.
