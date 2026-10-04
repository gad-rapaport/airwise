# Decisions

## Provider: Open-Meteo Air Quality API

Checked before choosing (2026-10-04):

| Criterion | Finding |
| --- | --- |
| Documentation | Official docs at open-meteo.com/en/docs/air-quality-api; parameters and response format documented |
| Licence | Data under CC BY 4.0; attribution to Open-Meteo and CAMS shown in the UI |
| Terms | Free tier for non-commercial use; this portfolio is non-commercial |
| Rate limits | Free tier: under 600 calls per minute, 5,000 per hour, 10,000 per day |
| Key | Not required on the free tier (verified with a real request) |
| Cost | Free for this use |
| Availability | Public HTTPS endpoint; data from CAMS updated every 12-24 h |

Alternatives considered: OpenAQ (station measurements, but requires an API key and coverage in the region is
uneven) and national monitoring portals (no stable public JSON API). Open-Meteo gives consistent, gridded data
for every city and needs no secret, which keeps the demo reproducible.

## Cache policy

- **One request for everything.** Ten locations, five variables, 7 past and 3 forecast days in one call
  (about 10 weighted calls by Open-Meteo's accounting). Hourly refreshes use about 240 of the 10,000 daily calls.
- **Fresh for 30 minutes, scheduled refresh every 60 minutes (±10 % jitter).** CAMS updates every 12-24 h, so
  hourly polling already over-samples; 30 minutes of freshness means a read in a busy period never triggers
  more than two refreshes per hour.
- **Stale-while-revalidate.** Reads never wait for the provider once data exists. Aging data triggers one
  background refresh.
- **Serve old data rather than nothing,** labelled clearly. Past values do not change much after the fact;
  forecasts do, so data older than 48 h is labelled "Outdated".
- **Retention 30 days** of observations, so a weekly view stays possible while the database stays small.
- **Trade-off:** freshness vs. provider load. A shorter TTL would show new forecasts minutes earlier at the
  cost of many more calls for no practical gain at this update cadence.

## Resilience limits

| Mechanism | Setting | Reason |
| --- | --- | --- |
| Timeouts | 3 s connect, 10 s read | The response is about 90 KB; anything slower is an outage. |
| Retries | at most 2, only for timeouts, network errors, 5xx and 429 | 4xx and schema errors will not improve on retry. |
| Backoff | full jitter, base 0.5 s, doubled per attempt | Avoids synchronised retries. |
| Retry-After | waited for if at most 5 s; otherwise a cooldown that blocks calls until then | Never block a refresh for minutes. |
| Local budget | 6 HTTP calls per minute | A bug or a loop cannot burn the provider quota. |
| Circuit breaker | opens after 3 failed refreshes for 5 min, then one trial call | Stops hammering a provider that is down. |
| Manual refresh | 120 s cooldown, server-side | The endpoint is public; this keeps it harmless. |

Kept in-house instead of using a resilience library: about 100 lines, fully tested, and the behaviour is the
point of the project.

## SQLite instead of PostgreSQL or Redis

One writer, small volume (about 12,000 rows per fetch), one process. SQLite gives durability across restarts,
transactions and an online backup API with no extra container. Redis would add a service for a cache that a
single process can hold in SQLite.

## Python for this project

Data integration work is commonly done in Python and Pydantic makes the provider contract explicit. The
frontend stays in TypeScript like the rest of the portfolio.

## Snapshot as a first-class mode

A committed, real response lets the demo run offline, makes CI independent of a third party, and doubles as a
contract test fixture. The trade-off is that the snapshot ages; the UI always shows its capture date.

## No polling in the browser

The page loads data when the user changes a setting or presses Refresh. The server's schedule keeps data
current. This keeps an idle tab at zero requests.

## Hand-built SVG chart

A chart library would add 100-300 KB and make the accessibility features (keyboard cursor with a live-region
readout, marker shapes, label collision handling, WHO reference line) harder to control. `d3-scale` and
`d3-shape` provide the maths in a few KB.
