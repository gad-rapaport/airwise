# Architecture

## Components and data flow

```mermaid
flowchart LR
  Browser["Browser<br/>React + SVG chart"] -- "/api/*" --> App
  subgraph Container ["airwise (one container)"]
    App["FastAPI app"] --> Service["AirService<br/>freshness policy, single-flight"]
    Scheduler["refresh loop<br/>(in-process)"] --> Service
    Service --> Client["ProviderClient<br/>timeouts, retries, budget, breaker"]
    Service --> Store[("SQLite<br/>/data/airwise.db")]
    Service -. "first start, provider down<br/>or snapshot mode" .-> Snapshot["bundled snapshot<br/>(read-only file)"]
  end
  Client -- "1 HTTPS request<br/>10 locations" --> Provider["Open-Meteo<br/>Air Quality API"]
```

1. A refresh (scheduled, read-triggered or manual) calls the provider once for all ten locations.
2. The raw JSON is validated by Pydantic models ([provider/schema.py](../src/airwise/provider/schema.py)):
   array lengths, strictly increasing UTC timestamps, expected units, no negative concentrations, right
   number of locations, coordinates within 0.5° of the request.
3. Valid data is flattened into `(location, metric, timestamp, value)` rows and upserted in one SQLite
   transaction, together with a `fetches` row (time, source, SHA-256 of the payload) and retention cleanup.
4. Reads (`/api/series`, `/api/summary`) are served from SQLite. They never wait for the provider unless
   there is no data at all.

## Internal model

| Table | Purpose |
| --- | --- |
| `observations (location_id, metric, ts, value)` | Primary key on all three identifiers; `WITHOUT ROWID` keeps it compact. Newer fetches overwrite forecasts for the same hour. |
| `fetches` | When each dataset arrived and from where (`live` or `snapshot`). Points after `fetched_at` are forecasts relative to that fetch. |
| `refresh_log` | Every refresh attempt: trigger, outcome, detail, number of HTTP attempts. Shown in the status panel. |

Timestamps are Unix seconds in UTC (`timeformat=unixtime` on the request removes any time zone ambiguity).
Conversion to local time happens only for display and for daily buckets.

## Freshness states

| State | Condition | UI |
| --- | --- | --- |
| `fresh` | live data younger than `fresh_ttl_s` (30 min) | green "Live" |
| `aging` | 30 min to 6 h | green, "refresh due"; a background refresh is triggered by the read |
| `stale` | 6 h to 48 h | amber "Saved data" with the last provider error |
| `expired` | older than 48 h | red "Outdated", forecasts flagged as outdated |
| `snapshot` | data came from the bundled file | amber "Offline snapshot" with capture time |

## Refresh coordination

```mermaid
sequenceDiagram
  participant R1 as Read 1
  participant R2 as Read 2..n
  participant S as AirService
  participant P as Provider
  R1->>S: ensure_data() (data aging)
  S->>S: start background task (single-flight)
  R1-->>R1: answered from SQLite immediately
  R2->>S: ensure_data()
  S-->>R2: refresh already running, answered from SQLite
  S->>P: GET /v1/air-quality (attempt 1)
  P-->>S: 503
  S->>S: sleep(jittered backoff)
  S->>P: attempt 2
  P-->>S: 200 + payload
  S->>S: validate, map, upsert in one transaction
```

`refresh()` keeps one `asyncio.Task`; concurrent callers await the same task through `asyncio.shield`, so a
disconnecting client cannot cancel work others depend on.

## Process model

One Uvicorn process, one event loop. SQLite work runs in worker threads (`asyncio.to_thread`) with
short-lived connections and WAL mode, so reads continue during a refresh. The scheduler is an asyncio task
started and stopped with the app's lifespan.
