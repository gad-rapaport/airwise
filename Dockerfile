# syntax=docker/dockerfile:1.7

# ---- web build (Node only exists in this stage) ----
FROM node:24-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY web/index.html web/vite.config.ts web/tsconfig.json ./
COPY web/public ./public
COPY web/src ./src
RUN npx vite build

# ---- Python dependencies into a virtual environment ----
FROM python:3.14-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-editable

# ---- runtime: Python + venv + static files, non-root ----
FROM python:3.14-slim AS runtime
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin airwise \
 && mkdir -p /data \
 && chown airwise:airwise /data
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY --from=web /web/dist /app/web
COPY data/snapshot /app/snapshot
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AIRWISE_WEB_DIST=/app/web \
    AIRWISE_DB_PATH=/data/airwise.db \
    AIRWISE_SNAPSHOT_PATH=/app/snapshot/open-meteo-air-quality.json
USER airwise
EXPOSE 8000
VOLUME ["/data"]
HEALTHCHECK --interval=20s --timeout=4s --start-period=20s --retries=3 CMD ["python", "-m", "airwise.cli", "healthcheck"]
CMD ["python", "-m", "airwise"]
