# Design

## Identity

Airwise reads like a calm weather report: a deep teal-navy masthead, misty off-white ground and a single teal
accent for interactive elements. The data carries the colour; the interface stays quiet. The logo is two
wind lines in a circle.

## Typography

**Atkinson Hyperlegible Next** for all text and **Atkinson Hyperlegible Mono** for values. The family was
designed by the Braille Institute for readers with low vision: letterforms that are easy to tell apart
(including 0/O and 1/l/I, which matters for readings like "PM10") and generous spacing. For a public data
product where people compare numbers, legibility beats personality. Shipped as Latin subsets only.

## Colour

| Use | Colour | Contrast on white |
| --- | --- | --- |
| Text | `#102a33` | 13.9 on mist background |
| Secondary text | `#4d6570` | 6.2 (5.7 on mist) |
| Accent / selected controls | `#0d6b73` (white text on it: 6.2) | 6.2 |
| Series 1-4 | `#0a62a6`, `#c4510a`, `#0b7a5c`, `#9b3f86` | 6.3, 4.6, 5.3, 6.1 |
| Fresh / stale / outdated banners | `#1f5f3a` on `#e5f4ea`, `#8a5a00` on `#fff6e0`, `#9b2c2c` on `#fdeceb` | 6.7, 5.5, 6.6 |

Series colours are the Okabe-Ito colour-blind-safe hues, darkened so each also passes 4.5:1 as text (used for
direct line labels). Every series also has its own marker shape (circle, square, triangle, diamond), shown in
the legend, at line ends and on daily points, so colour is never the only cue. EAQI cards show the official
EEA band colour as a swatch beside the band name; the name carries the meaning.

## Chart decisions

- Y axis starts at zero (concentrations are ratio data) and always includes the WHO guideline line.
- X ticks are aligned to local midnight (or 6/12-hour steps) in the display time zone, not the browser's.
- Forecast period has a shaded background, a "Forecast" label and dashed lines; "now" is a dotted rule.
- End-of-line labels are spread vertically so they never overlap; on narrow screens the legend replaces them.
- Hover or arrow keys move a cursor; values for all series at that time are announced in a live region.
  Home/End jump to the ends, PageUp/PageDown by a day.
- A data table with the same values is one click away and sticky-headed; forecast rows are tagged in text.
- A footnote explains that hourly values above a 24-hour guideline are not by themselves an exceedance.

## Layout and responsive behaviour

| Width | Behaviour |
| --- | --- |
| > 900 px | Settings rail on the left (sticky), content on the right |
| <= 900 px | Single column, chart first; a link jumps to the settings below |
| <= 520 px | Chart without end labels (legend instead), fewer x ticks, facts stacked |

Controls are native radio buttons, checkboxes and selects styled as segmented controls, so keyboard and screen
reader behaviour comes from the platform. When four locations are selected, the rest are disabled and the hint
says why.

## Accessibility checks

axe-core reports no serious or critical violations on the main page (desktop) and on the phone layout; E2E
covers keyboard reading of the chart and the absence of horizontal scrolling. `prefers-reduced-motion` is
respected (there is no animation to begin with). Print styles drop controls.

## Assets and licences

| Asset | Source | Licence |
| --- | --- | --- |
| Atkinson Hyperlegible Next and Mono | `@fontsource/atkinson-hyperlegible-next`, `@fontsource/atkinson-hyperlegible-mono` | SIL Open Font License 1.1 |
| Logo and icons | Inline SVG in this repository | Part of this project |
| Air quality data | Open-Meteo Air Quality API / CAMS | CC BY 4.0, attributed in the UI |
