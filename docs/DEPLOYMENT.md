# Deployment

## Local Docker (current)

[Dockerfile](../Dockerfile) stages: Node 24 builds the web app; `python:3.14-slim` with uv builds a virtual
environment from `uv.lock` (no dev dependencies, bytecode precompiled); the runtime image copies only the venv,
the static build and the snapshot, and runs as uid 10001. Node, uv, tests and sources of the web app are not in
the final image.

[compose.yaml](../compose.yaml): port `127.0.0.1:8102`, volume `data`, read-only root filesystem, 16 MB `/tmp`,
1 CPU, 192 MB, 64 PIDs, `restart: on-failure:3`, log rotation.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml):

| Job | Steps |
| --- | --- |
| python | uv from lockfile, ruff format check, ruff lint, mypy strict, pytest, pip-audit of runtime dependencies |
| web | `npm ci`, Prettier, ESLint, type check, Vitest, build, npm audit |
| e2e | Buildx image with GitHub cache, stack in snapshot mode, Playwright desktop and phone, image size, Trivy report |
| secrets | gitleaks over full history |

Read-only permissions, SHA-pinned actions, superseded runs cancelled, report artefacts kept 7 days. CI never
contacts the provider.

## CD (prepared, disabled)

[.github/workflows/deploy.yml](../.github/workflows/deploy.yml): manual `publish` of
`ghcr.io/<owner>/airwise:<sha>`; `deploy` only with `DEPLOY_ENABLED=true`, an approved `demo` environment and
the deploy input ticked. It runs [deploy/deploy.sh](../deploy/deploy.sh) on the host with the pinned digest
and smoke-tests `/readyz`. [compose.prod.yaml](../compose.prod.yaml) defaults a public deployment to snapshot
mode so visitors cannot generate provider traffic.

Verified: the production override resolves with `docker compose config`. Not verified: publishing, the SSH
deploy and the remote smoke test; no deployment has been made.

## Rollback

`deploy.sh` records each deployed image and returns to the previous one automatically if the new container is
not healthy within 90 s, or on `deploy.sh --rollback`. The SQLite schema uses `CREATE TABLE IF NOT EXISTS`
only and has never removed a column, so older images can read data written by newer ones. Any future
destructive schema change would need an explicit migration and a backup first.
