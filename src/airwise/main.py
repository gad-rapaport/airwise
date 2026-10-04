"""FastAPI application: routes, middleware, lifecycle."""

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from airwise import __version__
from airwise.catalog import LOCATIONS, LOCATIONS_BY_ID, METRICS, REGIONS, MetricId
from airwise.config import Settings
from airwise.provider.client import ProviderClient
from airwise.scheduler import refresh_loop
from airwise.service import AirService, RefreshCooldown
from airwise.store import Store

log = logging.getLogger("airwise")

ALLOWED_HOURS = (24, 72, 168)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "time": round(record.created, 3),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in ("request_id", "method", "path", "status", "duration_ms"):
            if hasattr(record, key):
                entry[key] = getattr(record, key)
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    logging.getLogger("uvicorn.access").disabled = True  # replaced by our request log
    logging.getLogger("httpx").setLevel(logging.WARNING)


def error(
    status: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return JSONResponse(body, status_code=status, headers=headers)


class AssetFiles(StaticFiles):
    """Static web build: hashed assets cached forever, everything else revalidated."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["cache-control"] = (
            "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
        )
        return response


CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
    "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


def create_app(settings: Settings | None = None, client: ProviderClient | None = None) -> FastAPI:
    settings = settings or Settings()
    store = Store(settings.db_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        await store.init()
        provider = client
        if provider is None and settings.provider_mode == "live":
            provider = ProviderClient(settings)
        service = AirService(settings, store, provider)
        app.state.service = service
        stop = asyncio.Event()
        loop_task = None
        if settings.scheduler_enabled and settings.provider_mode == "live":
            loop_task = asyncio.create_task(refresh_loop(service, stop))
        log.info("airwise %s started in %s mode", __version__, settings.provider_mode)
        try:
            yield
        finally:
            stop.set()
            if loop_task:
                await loop_task
            await service.aclose()
            if provider:
                await provider.aclose()

    app = FastAPI(
        title="Airwise",
        version=__version__,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        incoming = request.headers.get("x-request-id", "")
        request_id = (
            incoming
            if 8 <= len(incoming) <= 64 and incoming.replace("-", "").isalnum()
            else str(uuid.uuid4())
        )
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        duration = round((time.perf_counter() - started) * 1000, 1)
        response.headers["x-request-id"] = request_id
        response.headers["content-security-policy"] = CSP
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "no-referrer"
        response.headers["x-frame-options"] = "DENY"
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("cache-control", "no-cache")
        if request.url.path not in ("/healthz", "/readyz"):
            log.info(
                "request",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": duration,
                },
            )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_failed(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = {".".join(str(p) for p in e["loc"][1:]) or "_": e["msg"] for e in exc.errors()}
        return error(400, "VALIDATION_FAILED", "Some parameters are invalid.", {"fields": fields})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return error(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", extra={"request_id": getattr(request.state, "request_id", None)})
        return error(
            500,
            "INTERNAL",
            "Something went wrong. Quote the request id if it keeps happening.",
            {"requestId": getattr(request.state, "request_id", None)},
        )

    def service(request: Request) -> AirService:
        svc: AirService = request.app.state.service
        return svc

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz(request: Request) -> Response:
        try:
            await service(request).store.ping()
        except Exception:
            return JSONResponse({"status": "unavailable"}, status_code=503)
        return JSONResponse({"status": "ready"})

    @app.get("/api/catalog")
    async def catalog() -> dict[str, Any]:
        return {
            "regions": [{"id": k, "name": v} for k, v in REGIONS.items()],
            "locations": [
                {
                    "id": loc.id,
                    "name": loc.name,
                    "region": loc.region,
                    "latitude": loc.latitude,
                    "longitude": loc.longitude,
                }
                for loc in LOCATIONS
            ],
            "metrics": [
                {
                    "id": m.id,
                    "label": m.label,
                    "short": m.short,
                    "unit": m.unit,
                    "guideline": m.guideline,
                    "guidelinePeriod": m.guideline_period,
                }
                for m in METRICS
            ],
            "attribution": {
                "text": "Air quality data: Open-Meteo Air Quality API, based on Copernicus Atmosphere "
                "Monitoring Service (CAMS) forecasts. Licensed CC BY 4.0.",
                "url": "https://open-meteo.com/en/docs/air-quality-api",
            },
        }

    @app.get("/api/series")
    async def series(
        request: Request,
        locations: Annotated[
            str, Query(min_length=1, max_length=200, description="Comma-separated ids, 1-4")
        ],
        metric: MetricId = "pm2_5",
        hours: int = 72,
        forecast: bool = True,
        resolution: Literal["hourly", "daily"] = "hourly",
    ) -> Response:
        ids = list(dict.fromkeys(part.strip() for part in locations.split(",") if part.strip()))
        unknown = [i for i in ids if i not in LOCATIONS_BY_ID]
        if unknown:
            return error(
                400,
                "VALIDATION_FAILED",
                f"Unknown location: {', '.join(unknown)}.",
                {"fields": {"locations": "Unknown location id."}},
            )
        if hours not in ALLOWED_HOURS:
            return error(
                400,
                "VALIDATION_FAILED",
                "Choose a window of 24, 72 or 168 hours.",
                {"fields": {"hours": "Use 24, 72 or 168."}},
            )
        if not 1 <= len(ids) <= 4:
            return error(
                400,
                "VALIDATION_FAILED",
                "Compare between 1 and 4 locations.",
                {"fields": {"locations": "Choose 1 to 4 locations."}},
            )
        data = await service(request).series(ids, metric, hours, forecast, resolution)
        return JSONResponse(data)

    @app.get("/api/summary")
    async def summary(request: Request) -> dict[str, Any]:
        return await service(request).summary()

    @app.get("/api/status")
    async def status(request: Request) -> dict[str, Any]:
        return await service(request).status()

    @app.post("/api/refresh", status_code=202)
    async def refresh(request: Request) -> Response:
        try:
            outcome = await service(request).manual_refresh()
        except RefreshCooldown as cd:
            wait = max(1, round(cd.retry_after))
            return error(
                429,
                "REFRESH_COOLDOWN",
                f"A refresh ran recently. Try again in {wait} s.",
                {"retryAfterS": wait},
                headers={"retry-after": str(wait)},
            )
        svc = service(request)
        return JSONResponse(
            {
                "outcome": outcome.outcome,
                "detail": outcome.detail,
                "freshness": (await svc.status())["freshness"],
            },
            status_code=202,
        )

    if settings.web_dist and Path(settings.web_dist).is_dir():
        app.mount("/", AssetFiles(directory=settings.web_dist, html=True), name="web")

    return app


def run() -> None:  # pragma: no cover - process entry point
    import uvicorn

    settings = Settings()
    configure_logging(settings.log_level)
    uvicorn.run(
        create_app(settings),
        host="0.0.0.0",  # noqa: S104 - inside the container; Compose publishes to 127.0.0.1 only
        port=8000,
        log_config=None,
        proxy_headers=False,
        server_header=False,
        date_header=True,
    )
