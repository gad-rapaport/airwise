# Rendering the product film

## Requirements

- Node.js 24 and the web package's dev dependencies (`cd web; npm ci`), which include Playwright;
  `npx playwright install chromium` once.
- ffmpeg 6 or newer on `PATH` (rendered with 8.0.1).

The renderer reads Playwright from `web/` (`requireFrom` in `render.config.json`) and the snapshot from `data/`.
None of this is part of the Python service or its image.

## Commands (from the repository root)

```powershell
node animation/render.mjs --serve     # live preview: http://127.0.0.1:4321/animation/
node animation/render.mjs --preview   # 960x540, 15 fps check
node animation/render.mjs             # final 1920x1080, 30 fps
```

Outputs in `animation/out/` (git-ignored): `airwise-film.mp4` (600 frames, 1.7 MB, H.264 yuv420p BT.709,
faststart), `poster.jpg` (12.4 s), `preview.webp` (4 s from 9.6 s, 640 px), contact sheet and
`render-report.json`. Frames are deleted after encoding; the final capture took 29 s.

## Publishing

```powershell
gh release upload v0.1.0 animation/out/airwise-film.mp4 --clobber
Copy-Item animation/out/poster.jpg, animation/out/preview.webp docs/media/
```

If the snapshot is refreshed, re-render: the chart lines and the EAQI card are computed from it.
