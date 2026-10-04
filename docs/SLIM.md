# Slim configuration

The default stack is the Slim configuration. One image and one code base; behaviour differs only by
environment variables.

| Aspect | Setting | Measured (2026-10-04) |
| --- | --- | --- |
| Containers | 1 (app); no database server, no cache service | |
| Image | `python:3.14-slim`, venv without dev dependencies, static web build | 222 MB unpacked, 53 MB compressed |
| Memory | 192 MB limit | 45 MiB idle after use |
| CPU / PIDs | 1 CPU, 64 PIDs | 0.2 % idle, 2 PIDs |
| Workers | One Uvicorn process | |
| Provider traffic | One request per refresh, at most hourly when idle | |
| Browser | No polling; 89 KB gzipped JavaScript | |
| Logs | 5 MB x 2 | |

## Modes

| Mode | How | Use |
| --- | --- | --- |
| Live (default) | `AIRWISE_PROVIDER_MODE=live` | Normal demo with current data |
| Snapshot | `AIRWISE_PROVIDER_MODE=snapshot` in `.env`, then `ops.ps1 start` | Offline demo, CI, public demo default |
| Outage drill | `ops.ps1 outage-on` / `outage-off` | Failure demonstration |

Snapshot mode keeps every user-facing feature; only provider refreshes are disabled and the banner says so.
