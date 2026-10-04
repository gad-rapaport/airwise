# Operations

## Health

| Check | Meaning |
| --- | --- |
| `GET /healthz` | Process up |
| `GET /readyz` | SQLite reachable; used by the container healthcheck (`python -m airwise.cli healthcheck`) |
| `GET /api/status` | Data freshness, circuit state, calls in the last minute, last 10 refreshes |

Provider trouble does **not** make the container unhealthy: the service keeps serving stored data, which is
the intended behaviour. Watch `/api/status` (or the status panel) for `circuit: open` or failed refreshes.

## Logs

JSON lines on stdout: `time`, `level`, `logger`, `msg`, and for requests `request_id`, `method`, `path`,
`status`, `duration_ms`. Health checks are not logged. Provider retries log a warning with the reason and the
delay. Docker rotates at 5 MB x 2 files.

## Background work

| Job | When | Behaviour |
| --- | --- | --- |
| Scheduled refresh | 5 s after start, then every 60 min ±10 % | Skips if data is fresh or the circuit is open |
| Read-triggered refresh | A read sees data older than 30 min | Runs in the background, deduplicated |
| Retention | With every successful refresh | Deletes observations older than 30 days, keeps 200 fetch rows and 500 refresh-log rows |

All jobs live in the app process and stop with it.

## Backup and restore

```powershell
./scripts/ops.ps1 backup                                    # backups/airwise-YYYYMMDD-HHMMSS.db
./scripts/ops.ps1 restore backups/airwise-....db -Yes      # stops app, integrity-checks, restores, starts
```

Backups use SQLite's online backup API, so they are consistent while the app is writing, and are saved as a
single self-contained file. Restore refuses files that lack the Airwise tables or fail `PRAGMA integrity_check`.

## Outage drill

```powershell
./scripts/ops.ps1 outage-on     # provider URL -> https://provider.invalid, freshness TTL 60 s
# wait a minute, reload the page: stored data stays, banner shows the provider error, status panel shows failed refreshes
./scripts/ops.ps1 outage-off
```

Results of the drill run on 2026-10-04 are in [TESTING.md](TESTING.md#drills-on-the-docker-stack).

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Banner "Saved data" or "Outdated" | Provider unreachable or circuit open | `/api/status` history shows the error; check outbound network; wait for the breaker (5 min) |
| Banner "Offline snapshot" in live mode | First start without network | Restore network; the next read triggers a live refresh |
| 429 on refresh | Cooldown (120 s) | Wait; scheduled refresh continues |
| `budget` errors in the log | Too many calls in one minute | Investigate the trigger; the budget is a safety net |
| Container unhealthy | `/data` not writable | Check the volume; the image creates `/data` owned by uid 10001 |
