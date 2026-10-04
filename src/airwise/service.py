"""Application service: freshness policy, single-flight refresh, fallbacks and read models."""

import asyncio
import logging
import time
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any, Literal
from zoneinfo import ZoneInfo

from airwise.aggregate import daily_means, mean, window_bounds
from airwise.catalog import LOCATIONS, LOCATIONS_BY_ID, METRICS_BY_ID, MetricId, eaqi_band
from airwise.config import Settings
from airwise.ingest import load_snapshot, payload_digest, to_rows
from airwise.provider.client import ProviderClient, ProviderError
from airwise.store import FetchInfo, RefreshRecord, Store

log = logging.getLogger("airwise.service")

type FreshnessState = Literal["fresh", "aging", "stale", "expired", "snapshot", "empty"]


@dataclass(frozen=True)
class Freshness:
    state: FreshnessState
    source: Literal["live", "snapshot"] | None
    fetched_at: float | None
    age_s: float | None
    refreshing: bool
    last_error: str | None
    message: str

    def to_json(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "source": self.source,
            "fetchedAt": self.fetched_at,
            "ageS": None if self.age_s is None else round(self.age_s),
            "refreshing": self.refreshing,
            "lastError": self.last_error,
            "message": self.message,
        }


@dataclass(frozen=True)
class RefreshOutcome:
    outcome: Literal["updated", "failed", "skipped"]
    detail: str


class RefreshCooldown(Exception):
    def __init__(self, retry_after: float) -> None:
        super().__init__(f"manual refresh available in {retry_after:.0f} s")
        self.retry_after = retry_after


class AirService:
    def __init__(
        self,
        settings: Settings,
        store: Store,
        client: ProviderClient | None,
        wall: Callable[[], float] = time.time,
    ) -> None:
        self.settings = settings
        self.store = store
        self.client = client
        self._wall = wall
        self._inflight: asyncio.Task[RefreshOutcome] | None = None
        self._background: set[asyncio.Task[Any]] = set()
        self._last_error: str | None = None
        self._last_manual: float | None = None
        self._tz = ZoneInfo(settings.display_timezone)

    # ---- refresh ----

    async def refresh(self, reason: str) -> RefreshOutcome:
        """Single-flight: concurrent callers share one upstream request."""
        if self._inflight is None or self._inflight.done():
            self._inflight = asyncio.create_task(self._refresh(reason))
        # shield: a caller that disconnects must not cancel the refresh other callers are waiting for.
        return await asyncio.shield(self._inflight)

    @property
    def refreshing(self) -> bool:
        return self._inflight is not None and not self._inflight.done()

    async def _refresh(self, reason: str) -> RefreshOutcome:
        started = self._wall()
        if self.settings.provider_mode == "snapshot" or self.client is None:
            return RefreshOutcome("skipped", "snapshot mode: provider calls are disabled")
        try:
            payload = await self.client.fetch(LOCATIONS)
            rows = to_rows(payload, LOCATIONS)
            raw = payload.model_dump_json().encode()
            await self._ingest(rows, "live", self._wall(), raw)
            self._last_error = None
            outcome = RefreshOutcome("updated", f"{len(rows)} values stored")
        except ProviderError as err:
            self._last_error = str(err)
            outcome = RefreshOutcome("failed", str(err))
            log.warning("refresh failed (%s): %s", reason, err)
        except ValueError as err:  # mapping errors
            self._last_error = f"mapping: {err}"
            outcome = RefreshOutcome("failed", self._last_error)
            log.warning("refresh produced unusable data: %s", err)
        attempts = self.client.last_attempts
        await self.store.log_refresh(
            RefreshRecord(started, self._wall(), reason, outcome.outcome, outcome.detail, attempts)
        )
        return outcome

    async def _ingest(
        self,
        rows: list[tuple[str, str, int, float | None]],
        source: Literal["live", "snapshot"],
        fetched_at: float,
        raw: bytes,
    ) -> None:
        timestamps = [r[2] for r in rows]
        info = FetchInfo(fetched_at, source, min(timestamps), max(timestamps), len(rows))
        cutoff = int(self._wall()) - self.settings.retention_days * 86_400
        await self.store.ingest(rows, info, payload_digest(raw), cutoff)

    async def load_snapshot(self) -> None:
        snap = load_snapshot(self.settings.snapshot_path)
        locations = [LOCATIONS_BY_ID[i] for i in snap.location_ids]
        rows = to_rows(snap.payload, locations)
        # Snapshot data is historical by definition; keep all of it regardless of the retention window.
        timestamps = [r[2] for r in rows]
        info = FetchInfo(snap.captured_at, "snapshot", min(timestamps), max(timestamps), len(rows))
        await self.store.ingest(rows, info, payload_digest(snap.raw), retention_cutoff=0)
        log.info("loaded snapshot captured at %s", snap.captured_at)

    async def ensure_data(self) -> FetchInfo | None:
        """Called on reads. Guarantees something to show and triggers background refresh when data ages."""
        latest = await self.store.latest_fetch()
        if latest is None:
            if self.settings.provider_mode == "live":
                result = await self.refresh("initial")
                if result.outcome == "updated":
                    return await self.store.latest_fetch()
            await self.load_snapshot()
            return await self.store.latest_fetch()
        if self._needs_refresh(latest) and not self.refreshing:
            self._spawn(self.refresh("stale-read"))
        return latest

    def _needs_refresh(self, latest: FetchInfo) -> bool:
        if self.settings.provider_mode != "live" or self.client is None:
            return False
        if latest.source == "snapshot":
            return self.client.breaker.allow()
        return (self._wall() - latest.fetched_at) >= self.settings.fresh_ttl_s and self.client.breaker.allow()

    def _spawn(self, coro: Coroutine[Any, Any, Any]) -> None:
        task = asyncio.create_task(coro)
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    async def manual_refresh(self) -> RefreshOutcome:
        if self.settings.provider_mode != "live":
            return RefreshOutcome("skipped", "snapshot mode: provider calls are disabled")
        now = self._wall()
        if self._last_manual is not None:
            wait = self._last_manual + self.settings.manual_refresh_cooldown_s - now
            if wait > 0:
                raise RefreshCooldown(wait)
        self._last_manual = now
        return await self.refresh("manual")

    async def aclose(self) -> None:
        for task in list(self._background):
            task.cancel()
        if self._inflight and not self._inflight.done():
            self._inflight.cancel()

    # ---- read models ----

    def freshness(self, latest: FetchInfo | None) -> Freshness:
        if latest is None:
            return Freshness("empty", None, None, None, self.refreshing, self._last_error, "No data yet.")
        age = self._wall() - latest.fetched_at
        if latest.source == "snapshot":
            return Freshness(
                "snapshot",
                "snapshot",
                latest.fetched_at,
                age,
                self.refreshing,
                self._last_error,
                "Showing the bundled offline snapshot, not live data.",
            )
        s = self.settings
        state: FreshnessState
        if age < s.fresh_ttl_s:
            state, msg = "fresh", "Up to date."
        elif age < s.stale_warning_s:
            state, msg = "aging", "Recent data; a refresh is due."
        elif age < s.expired_after_s:
            state, msg = "stale", "Showing saved data that is several hours old."
        else:
            state, msg = "expired", "Saved data is more than 48 hours old; forecasts shown are outdated."
        return Freshness(state, "live", latest.fetched_at, age, self.refreshing, self._last_error, msg)

    async def series(
        self,
        location_ids: list[str],
        metric: MetricId,
        hours_back: int,
        include_forecast: bool,
        resolution: Literal["hourly", "daily"],
    ) -> dict[str, Any]:
        latest = await self.ensure_data()
        now = int(self._wall())
        if latest is None:  # pragma: no cover - ensure_data always loads at least the snapshot
            raise RuntimeError("no data available")
        # In snapshot mode "now" is the capture time, so the window always shows the bundled data.
        anchor = int(latest.fetched_at) if latest.source == "snapshot" else now
        start, end = window_bounds(anchor, hours_back, include_forecast, latest.last_ts)
        rows = await self.store.observations(location_ids, metric, start, end)
        by_location: dict[str, list[tuple[int, float | None]]] = {i: [] for i in location_ids}
        for loc_id, _, ts, value in rows:
            by_location[loc_id].append((ts, value))
        series = []
        for loc_id in location_ids:
            points = by_location[loc_id]
            if resolution == "daily":
                points = daily_means(points, self._tz)
            loc = LOCATIONS_BY_ID[loc_id]
            series.append({"locationId": loc_id, "name": loc.name, "points": points})
        m = METRICS_BY_ID[metric]
        return {
            "metric": {
                "id": m.id,
                "label": m.label,
                "short": m.short,
                "unit": m.unit,
                "guideline": m.guideline,
                "guidelinePeriod": m.guideline_period,
            },
            "resolution": resolution,
            "from": start,
            "to": end,
            "now": anchor,
            "forecastFrom": int(latest.fetched_at),
            "timezone": self.settings.display_timezone,
            "series": series,
            "freshness": self.freshness(latest).to_json(),
        }

    async def summary(self) -> dict[str, Any]:
        latest = await self.ensure_data()
        anchor = int(latest.fetched_at) if latest and latest.source == "snapshot" else int(self._wall())
        rows = await self.store.latest_values(anchor)
        values: dict[str, dict[str, tuple[int, float | None]]] = {}
        for loc_id, metric, ts, value in rows:
            values.setdefault(loc_id, {})[metric] = (ts, value)
        day_rows = await self.store.observations(
            [loc.id for loc in LOCATIONS], "pm2_5", anchor - 24 * 3600, anchor
        )
        pm25_24h: dict[str, list[float | None]] = {}
        for loc_id, _, _, value in day_rows:
            pm25_24h.setdefault(loc_id, []).append(value)
        items = []
        for loc in LOCATIONS:
            v = values.get(loc.id, {})
            aqi = v.get("european_aqi", (None, None))[1]
            items.append(
                {
                    "locationId": loc.id,
                    "name": loc.name,
                    "region": loc.region,
                    "observedAt": max((t for t, _ in v.values()), default=None),
                    "values": {k: val for k, (_, val) in v.items()},
                    "eaqiBand": eaqi_band(aqi),
                    "pm25Mean24h": mean(pm25_24h.get(loc.id, [])),
                }
            )
        return {"items": items, "freshness": self.freshness(latest).to_json()}

    async def status(self) -> dict[str, Any]:
        latest = await self.store.latest_fetch()
        history = await self.store.recent_refreshes(10)
        client = self.client
        return {
            "mode": self.settings.provider_mode,
            "provider": str(self.settings.provider_base_url),
            "freshness": self.freshness(latest).to_json(),
            "circuit": client.breaker.state if client else "n/a",
            "blockedForS": round(client.breaker.blocked_for(), 1) if client else 0,
            "callsLastMinute": client.budget.used() if client else 0,
            "callBudgetPerMinute": self.settings.provider_max_calls_per_minute,
            "freshTtlS": self.settings.fresh_ttl_s,
            "refreshIntervalS": self.settings.refresh_interval_s,
            "schedulerEnabled": self.settings.scheduler_enabled and self.settings.provider_mode == "live",
            "history": [
                {
                    "startedAt": h.started_at,
                    "finishedAt": h.finished_at,
                    "reason": h.reason,
                    "outcome": h.outcome,
                    "detail": h.detail,
                    "attempts": h.attempts,
                }
                for h in history
            ],
        }
