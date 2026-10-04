# Offline snapshot

`open-meteo-air-quality.json` is one real response from the Open-Meteo Air Quality API, captured on
2026-10-04 at 08:39 UTC with [scripts/capture_snapshot.py](../../scripts/capture_snapshot.py), for all ten
Airwise locations: 7 past days and 3 forecast days, hourly PM2.5, PM10, NO₂, O₃ and European AQI.

It is used:

- when `AIRWISE_PROVIDER_MODE=snapshot` (offline demos, CI E2E), and
- as a fallback on first start if the provider cannot be reached and nothing is stored yet.

The file stores the provider response unchanged under `response`, plus the capture time, the exact request
parameters and the location order. The app validates it with the same schema as live responses, so the
schema tests also act as a contract test against a real recorded response.

## Licence and attribution

Data: Open-Meteo Air Quality API (https://open-meteo.com/), based on Copernicus Atmosphere Monitoring Service
(CAMS) European and global forecasts. Licensed under Creative Commons Attribution 4.0 (CC BY 4.0). The
attribution is also shown in the application footer.

## Refreshing it

```powershell
uv run python scripts/capture_snapshot.py   # one provider request
```

Review the diff and update the capture date above before committing.
