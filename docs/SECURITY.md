# Security

Airwise has no accounts and stores no personal data. The main risks are abuse of the upstream provider,
trusting malformed upstream data, and the usual web and container exposure.

## Threat model

| Asset or risk | Threat | Mitigation | Residual risk |
| --- | --- | --- | --- |
| Provider quota and terms | A client or bug causes excessive upstream calls | Single-flight refresh; reads served from SQLite; local budget of 6 calls per minute; manual refresh cooldown 120 s; circuit breaker; scheduler jitter | A determined client can still trigger one manual refresh every 2 minutes. |
| Data integrity | Malformed or changed provider response | Strict Pydantic schema (lengths, units, UTC, ordering, non-negative values), location count and coordinate checks, 5 MB size limit, nothing stored unless the whole payload is valid | A plausible but wrong value inside the valid range is not detectable. |
| Upstream redirect or SSRF | Provider URL redirected elsewhere | Fixed base URL from configuration; redirects disabled; users cannot supply URLs | |
| Browser | XSS | React escaping; CSP `default-src 'self'` with no inline scripts; no HTML from the provider is rendered | |
| Browser | Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | |
| API | Malformed input | Typed query parameters, location whitelist, 1-4 locations, fixed window values; structured 400 errors | No per-client rate limit on read endpoints (they are cheap SQLite reads). |
| Errors | Information leakage | Generic 500 body with a request id; details only in server logs | |
| Container | Breakout impact | Non-root user (uid 10001), read-only root filesystem, `/data` the only writable volume, all capabilities dropped, `no-new-privileges`, 192 MB / 64 PIDs limit | Needs outbound internet in live mode, so it is not on an internal-only network. |
| Exposure | Network | Published on `127.0.0.1:8102` only | |

## Secrets

None exist. The provider is keyless, there is no database password, and `.env` holds only non-secret
settings. Gitleaks still scans the full history in CI.

## CSRF

The only state-changing endpoint is `POST /api/refresh`. It uses no cookies or credentials, so a cross-site
request gains nothing beyond what any visitor can do, and the cooldown bounds its effect.

## Scanning

- Secrets: gitleaks over the full Git history in CI.
- Python: `pip-audit --strict` against the exported runtime requirements fails CI on known vulnerabilities.
- Web: `npm audit --audit-level=high`. All web packages are build-time only.
- Image: Trivy HIGH and CRITICAL report in the CI summary (report-only, like the other projects: base-image
  findings are fixed by rebuilding on a newer base).

## Known limitations

- Data shown is modelled, not measured, and must not be used for health decisions. The UI footer states that it
  is model data rather than station measurements.
