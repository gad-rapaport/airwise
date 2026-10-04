# Animation brief

## Purpose and audience

A 20-second film for the portfolio page and README that makes the invisible part of Airwise visible: what
happens between the user's question and the chart. Audience: interviewers for integration and backend roles.
It must work without sound.

## Core message

Ten cities are fetched in one checked request, stored, compared honestly, and still shown, labelled, when the
provider is down.

## Reference and what was taken from it

The local reference video (an illustrated product film, stored rotated by 90 degrees and viewed in the correct
orientation frame by frame; not included here) moves from a person to a screen to an abstract space where
objects travel, then back to the person for the result. Adapted for Airwise:

| Reference element | Here |
| --- | --- |
| Person with a need in a simple environment | Geometric runner in a city skyline with drifting haze |
| Push from the person into the device | The phone in the runner's hand grows into the whole frame |
| Dark abstract space where objects float and are handled | Data space where requests and response packets travel along paths |
| Object carried through a gate / picked out | Packets pass a schema check; one invalid packet is rejected |
| Return to the human scene for the outcome | Haze clears, the runner sets off |

Not taken: any character, brand, layout, colour or asset of the reference. The motion language here is
geometric (lines, packets, layers, a chart drawing itself), unlike the other films in the portfolio.

## Duration and format

20.0 s, 1920x1080, 30 fps, H.264 (yuv420p, BT.709, faststart), no audio.

## Palette and typography

Airwise tokens: mist `#f4f7f8`, navy `#102a33`, teal `#0d6b73`, series colours `#0a62a6`, `#c4510a`, `#0b7a5c`,
`#9b3f86` (the colour-blind-safe set used in the app, each with its own marker shape in the legend), stale
amber `#8a5a00` on `#fff6e0`. Atkinson Hyperlegible Next and Mono, from the web app's font packages.

## Motion language

Geometric and procedural: paths draw on with `stroke-dashoffset`, packets follow eased paths with stagger,
layers stack with a small overshoot, the chart lines draw left to right over 1.6 s, the outage is a single
cross on the link. Easing `inOutCubic` for travel, `outBack` for arrivals. No flashes.

## Scenes

| # | Time | Content | Capability |
| --- | --- | --- | --- |
| 1 | 0-4.0 | Skyline rises, haze drifts, runner checks the phone (real phone screenshot of Airwise) | The need |
| 2 | 4.0-9.4 | Ten cities converge on one request to Open-Meteo; packets return through a schema check (one rejected) into local storage | One request for all locations, validation, SQLite store |
| 3 | 9.4-12.8 | Chart builds from the real bundled snapshot: PM2.5 for four cities, WHO line, forecast area | Comparison, guideline, forecast |
| 4 | 12.9-15.4 | Link to the provider breaks; the chart stays; the app's "Saved data" banner appears | Failure handling |
| 5 | 15.4-17.8 | Back to the city, haze clears, Tel Aviv-Yafo EAQI card (value computed from the snapshot), runner runs | Outcome |
| 6 | 17.8-20.0 | Mark, name, tagline, repository, data credit | Brand and attribution |

Timing per element: [ANIMATION-STORYBOARD.md](ANIMATION-STORYBOARD.md).

## On-screen text

"Run now, or wait for cleaner air?" / "Ten cities, one request, checked before storing." / "Real data, compared
against the WHO line." / "Provider down? Saved data stays, clearly labelled." / "Fair air. Good to go." /
"Airwise" / "Air quality across Israel and the Eastern Mediterranean" / repository / "Data: Open-Meteo Air
Quality API, CAMS forecasts, CC BY 4.0".

## Assets and sources

| Asset | Source |
| --- | --- |
| Chart lines and EAQI value | `data/snapshot/open-meteo-air-quality.json` (real response, CC BY 4.0), read at render time |
| Phone screen | `docs/screenshots/mobile.png` captured from the running app |
| Banner wording | The app's "Saved data" state |
| Everything else | Original SVG in [animation/scene.js](../animation/scene.js) |
| Fonts | Atkinson Hyperlegible Next and Mono (SIL OFL) |
| Music | None |

## Production

Same pipeline as the other portfolio films: SVG scene, deterministic `seek(t)`, Playwright frame capture,
ffmpeg encode; nothing in the app image. See [ANIMATION-RENDERING.md](ANIMATION-RENDERING.md).

## Acceptance checks

Reviewed from start to end on contact sheets and per-transition frame sheets; fixed a leftover curtain
fragment, overlapping city labels and a banner over the chart title before the final render. All capabilities
shown are implemented and tested (`test_client.py`, `test_service.py`, E2E). No personal data.
