# API

Read-only JSON API on the same origin as the web app. The generated OpenAPI 3.1 description is served at
`/api/openapi.json` (the Swagger UI page is disabled because it needs third-party scripts that the CSP blocks).

Errors use one shape: `{ "error": { "code": "...", "message": "...", "details": { ... } } }`.
Every response carries `X-Request-Id`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/catalog` | Regions, locations, metrics (unit, WHO guideline) and the attribution text |
| GET | `/api/series` | Time series for 1-4 locations |
| GET | `/api/summary` | Latest values, EAQI band and 24-h PM2.5 mean for every location |
| GET | `/api/status` | Mode, freshness, circuit state, call budget use, last 10 refreshes |
| POST | `/api/refresh` | Manual refresh; 202 with the outcome, 429 `REFRESH_COOLDOWN` with `Retry-After` |
| GET | `/healthz` | Process up |
| GET | `/readyz` | Database reachable; 503 otherwise |

## `GET /api/series`

| Parameter | Values | Default |
| --- | --- | --- |
| `locations` | comma-separated ids, 1-4 (see catalog) | required |
| `metric` | `pm2_5`, `pm10`, `nitrogen_dioxide`, `ozone`, `european_aqi` | `pm2_5` |
| `hours` | `24`, `72`, `168` (history before now) | `72` |
| `forecast` | `true`, `false` | `true` |
| `resolution` | `hourly`, `daily` (local-day mean, needs 18 of 24 hours) | `hourly` |

Response (abridged):

```json
{
  "metric": { "id": "pm2_5", "unit": "µg/m³", "guideline": 15.0, "guidelinePeriod": "24-hour mean" },
  "resolution": "hourly",
  "from": 1790845200, "to": 1791327600, "now": 1791111300, "forecastFrom": 1791111130,
  "timezone": "Asia/Jerusalem",
  "series": [{ "locationId": "tel-aviv", "name": "Tel Aviv-Yafo", "points": [[1790845200, 7.1], [1790848800, null]] }],
  "freshness": { "state": "fresh", "source": "live", "fetchedAt": 1791111130.5, "ageS": 170,
                 "refreshing": false, "lastError": null, "message": "Up to date." }
}
```

`points` are `[unix seconds UTC, value or null]`. Points after `forecastFrom` are forecasts.

Validation errors return 400 `VALIDATION_FAILED` with `details.fields` naming the parameter.
