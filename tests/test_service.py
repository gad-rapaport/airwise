import asyncio
from zoneinfo import ZoneInfo

import httpx
import pytest
import respx
from tests.conftest import BASE, FakeClock, make_payload

from airwise.aggregate import MIN_HOURS_FOR_DAILY_MEAN, daily_means, window_bounds
from airwise.catalog import LOCATIONS
from airwise.config import Settings
from airwise.provider.client import ProviderClient
from airwise.scheduler import tick
from airwise.service import AirService, RefreshCooldown
from airwise.store import Store

URL = f"{BASE}/v1/air-quality"
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def build(settings: Settings, clock: FakeClock) -> AirService:
    store = Store(settings.db_path)
    await store.init()
    client = ProviderClient(settings, http=httpx.AsyncClient(base_url=BASE), sleep=clock.sleep, now=clock.now)
    return AirService(settings, store, client, wall=clock.now)


def payload_around(clock: FakeClock) -> list[dict[str, object]]:
    start = int(clock.now()) - int(clock.now()) % 3600 - 48 * 3600
    return make_payload(start=start, hours=72)


@respx.mock
async def test_concurrent_reads_share_one_upstream_request(settings: Settings, clock: FakeClock) -> None:
    async def slow(_: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.05)
        return httpx.Response(200, json=payload_around(clock))

    route = respx.get(URL).mock(side_effect=slow)
    svc = await build(settings, clock)
    results = await asyncio.gather(*(svc.refresh("test") for _ in range(20)))
    assert route.call_count == 1
    assert {r.outcome for r in results} == {"updated"}


@respx.mock
async def test_first_start_with_provider_down_falls_back_to_snapshot(
    settings: Settings, clock: FakeClock
) -> None:
    respx.get(URL).mock(side_effect=httpx.ConnectError("down"))
    svc = await build(settings, clock)
    data = await svc.series(["tel-aviv"], "pm2_5", 72, True, "hourly")
    assert data["freshness"]["state"] == "snapshot"
    assert data["freshness"]["lastError"].startswith("network")
    assert len(data["series"][0]["points"]) > 0


@respx.mock
async def test_saved_data_is_served_and_flagged_when_the_provider_fails(
    settings: Settings, clock: FakeClock
) -> None:
    route = respx.get(URL).respond(json=payload_around(clock))
    svc = await build(settings, clock)
    await svc.refresh("initial")
    clock.advance(8 * 3600)  # older than the stale warning threshold
    route.mock(side_effect=httpx.ConnectError("down"))

    first = await svc.series(["tel-aviv", "haifa"], "pm10", 72, True, "hourly")
    await asyncio.sleep(0)  # let the background refresh started by the read run
    for task in list(svc._background):
        await task
    second = await svc.series(["tel-aviv", "haifa"], "pm10", 72, True, "hourly")

    assert first["freshness"]["state"] == "stale"
    assert second["freshness"]["state"] == "stale"
    assert second["freshness"]["lastError"].startswith("network")
    assert all(len(s["points"]) > 0 for s in second["series"])


@respx.mock
async def test_fresh_data_does_not_call_the_provider(settings: Settings, clock: FakeClock) -> None:
    route = respx.get(URL).respond(json=payload_around(clock))
    svc = await build(settings, clock)
    await svc.refresh("initial")
    clock.advance(60)
    for _ in range(5):
        await svc.series(["eilat"], "ozone", 24, False, "hourly")
    assert route.call_count == 1


@respx.mock
async def test_aging_data_triggers_exactly_one_background_refresh(
    settings: Settings, clock: FakeClock
) -> None:
    route = respx.get(URL).respond(json=payload_around(clock))
    svc = await build(settings, clock)
    await svc.refresh("initial")
    clock.advance(settings.fresh_ttl_s + 1)
    await asyncio.gather(*(svc.series(["athens"], "pm2_5", 24, True, "hourly") for _ in range(5)))
    for task in list(svc._background):
        await task
    assert route.call_count == 2


@respx.mock
async def test_manual_refresh_has_a_cooldown(settings: Settings, clock: FakeClock) -> None:
    respx.get(URL).respond(json=payload_around(clock))
    svc = await build(settings, clock)
    assert (await svc.manual_refresh()).outcome == "updated"
    with pytest.raises(RefreshCooldown) as info:
        await svc.manual_refresh()
    assert 0 < info.value.retry_after <= settings.manual_refresh_cooldown_s
    clock.advance(settings.manual_refresh_cooldown_s + 1)
    assert (await svc.manual_refresh()).outcome == "updated"


async def test_snapshot_mode_never_calls_out(settings: Settings, clock: FakeClock) -> None:
    with respx.mock(assert_all_called=False) as mock:
        route = mock.get(URL).respond(500)
        svc = AirService(
            settings.model_copy(update={"provider_mode": "snapshot"}),
            Store(settings.db_path),
            None,
            wall=clock.now,
        )
        await svc.store.init()
        data = await svc.series(["cairo"], "european_aqi", 168, True, "daily")
        assert (await svc.manual_refresh()).outcome == "skipped"
        assert route.call_count == 0
    assert data["freshness"]["state"] == "snapshot"


@respx.mock
async def test_retention_removes_old_observations(settings: Settings, clock: FakeClock) -> None:
    old_start = int(clock.now()) - 40 * 86_400
    respx.get(URL).mock(
        side_effect=[
            httpx.Response(200, json=make_payload(start=old_start - old_start % 3600, hours=24)),
            httpx.Response(200, json=payload_around(clock)),
        ]
    )
    svc = await build(settings, clock)
    await svc.refresh("old")
    await svc.refresh("new")
    rows = await svc.store.observations([loc.id for loc in LOCATIONS], "pm2_5", 0, int(clock.now()))
    assert min(r[2] for r in rows) >= int(clock.now()) - settings.retention_days * 86_400


@respx.mock
async def test_refresh_outcomes_are_recorded(settings: Settings, clock: FakeClock) -> None:
    respx.get(URL).mock(side_effect=[httpx.Response(503), httpx.Response(503), httpx.Response(503)])
    svc = await build(settings, clock)
    await svc.refresh("test")
    history = await svc.store.recent_refreshes()
    assert history[0].outcome == "failed"
    assert history[0].attempts == settings.provider_max_retries + 1


@respx.mock
async def test_scheduler_refreshes_only_when_needed(settings: Settings, clock: FakeClock) -> None:
    route = respx.get(URL).respond(json=payload_around(clock))
    svc = await build(settings, clock)
    assert await tick(svc) == "initial"
    assert await tick(svc) == "skipped-fresh"
    clock.advance(settings.fresh_ttl_s + 1)
    assert await tick(svc) == "updated"
    assert route.call_count == 2


def test_daily_mean_requires_enough_hours() -> None:
    tz = ZoneInfo("Asia/Jerusalem")
    midnight = 1_789_160_400  # 2026-09-12 00:00 in Asia/Jerusalem (UTC+3)
    full_day = [(midnight + h * 3600, 10.0 + h) for h in range(24)]
    partial = [(midnight + 86_400 + h * 3600, 50.0) for h in range(MIN_HOURS_FOR_DAILY_MEAN - 1)]
    result = daily_means(full_day + partial, tz)
    assert result == [(midnight, 21.5), (midnight + 86_400, None)]


def test_daily_mean_ignores_missing_hours_within_coverage() -> None:
    tz = ZoneInfo("UTC")
    start = 1_789_171_200  # 00:00 UTC
    points = [(start + h * 3600, None if h < 4 else 8.0) for h in range(24)]
    assert daily_means(points, tz) == [(start, 8.0)]


def test_window_without_forecast_stops_at_now() -> None:
    assert window_bounds(now=10_000, hours_back=1, include_forecast=False, last_ts=99_999) == (6_400, 10_000)
    assert window_bounds(now=10_000, hours_back=1, include_forecast=True, last_ts=99_999) == (6_400, 99_999)
