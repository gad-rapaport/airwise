import httpx
import pytest
import respx
from tests.conftest import BASE, FakeClock, make_payload

from airwise.catalog import LOCATIONS
from airwise.config import Settings
from airwise.provider.client import ProviderClient, ProviderError, parse_retry_after
from airwise.provider.resilience import CallBudget, CircuitBreaker, backoff_delay

URL = f"{BASE}/v1/air-quality"
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def client_for(settings: Settings, clock: FakeClock) -> ProviderClient:
    http = httpx.AsyncClient(base_url=BASE, timeout=2)
    return ProviderClient(settings, http=http, sleep=clock.sleep, now=clock.now)


@respx.mock
async def test_one_request_covers_every_location(settings: Settings, clock: FakeClock) -> None:
    route = respx.get(URL).respond(json=make_payload())
    payload = await client_for(settings, clock).fetch(LOCATIONS)
    assert len(payload.root) == len(LOCATIONS)
    assert route.call_count == 1
    params = route.calls[0].request.url.params
    assert params["timeformat"] == "unixtime"
    assert len(params["latitude"].split(",")) == len(LOCATIONS)


@respx.mock
async def test_server_errors_are_retried_with_backoff(settings: Settings, clock: FakeClock) -> None:
    route = respx.get(URL).mock(side_effect=[httpx.Response(503), httpx.Response(200, json=make_payload())])
    client = client_for(settings, clock)
    await client.fetch(LOCATIONS)
    assert route.call_count == 2
    assert len(clock.sleeps) == 1
    assert 0 <= clock.sleeps[0] <= settings.provider_backoff_base_s
    assert client.breaker.failures == 0


@respx.mock
async def test_timeouts_stop_after_the_retry_limit(settings: Settings, clock: FakeClock) -> None:
    route = respx.get(URL).mock(side_effect=httpx.ReadTimeout("slow"))
    client = client_for(settings, clock)
    with pytest.raises(ProviderError) as info:
        await client.fetch(LOCATIONS)
    assert info.value.kind == "timeout"
    assert route.call_count == settings.provider_max_retries + 1
    assert len(clock.sleeps) == settings.provider_max_retries
    assert client.breaker.failures == 1  # one logical failure, not one per attempt


@respx.mock
async def test_long_retry_after_pauses_calls_instead_of_waiting(settings: Settings, clock: FakeClock) -> None:
    route = respx.get(URL).respond(429, headers={"retry-after": "30"})
    client = client_for(settings, clock)
    with pytest.raises(ProviderError) as info:
        await client.fetch(LOCATIONS)
    assert info.value.kind == "rate_limited"
    assert route.call_count == 1
    assert clock.sleeps == []
    assert not client.breaker.allow()
    with pytest.raises(ProviderError) as again:
        await client.fetch(LOCATIONS)
    assert again.value.kind == "circuit_open"
    assert route.call_count == 1  # no request while cooling down
    clock.advance(31)
    route.respond(json=make_payload())
    await client.fetch(LOCATIONS)


@respx.mock
async def test_short_retry_after_is_honoured(settings: Settings, clock: FakeClock) -> None:
    respx.get(URL).mock(
        side_effect=[
            httpx.Response(429, headers={"retry-after": "2"}),
            httpx.Response(200, json=make_payload()),
        ]
    )
    await client_for(settings, clock).fetch(LOCATIONS)
    assert clock.sleeps == [2.0]


@respx.mock
async def test_client_errors_are_not_retried(settings: Settings, clock: FakeClock) -> None:
    route = respx.get(URL).respond(400, json={"error": True, "reason": "Parameter 'hourly' is invalid"})
    with pytest.raises(ProviderError) as info:
        await client_for(settings, clock).fetch(LOCATIONS)
    assert info.value.kind == "schema"
    assert "Parameter 'hourly' is invalid" in info.value.detail
    assert route.call_count == 1


@respx.mock
async def test_malformed_body_is_a_contract_error(settings: Settings, clock: FakeClock) -> None:
    bad = make_payload()
    bad[0]["hourly"]["pm2_5"] = bad[0]["hourly"]["pm2_5"][:-1]
    route = respx.get(URL).respond(json=bad)
    with pytest.raises(ProviderError) as info:
        await client_for(settings, clock).fetch(LOCATIONS)
    assert info.value.kind == "schema"
    assert route.call_count == 1


@respx.mock
async def test_wrong_number_of_locations_is_rejected(settings: Settings, clock: FakeClock) -> None:
    respx.get(URL).respond(json=make_payload(LOCATIONS[:3]))
    with pytest.raises(ProviderError, match="expected 10 locations"):
        await client_for(settings, clock).fetch(LOCATIONS)


@respx.mock
async def test_circuit_opens_after_repeated_failures_and_half_opens_later(
    settings: Settings, clock: FakeClock
) -> None:
    route = respx.get(URL).respond(500)
    client = client_for(settings.model_copy(update={"provider_max_retries": 0}), clock)
    for _ in range(settings.circuit_failure_threshold):
        with pytest.raises(ProviderError):
            await client.fetch(LOCATIONS)
    assert client.breaker.state == "open"
    calls = route.call_count
    with pytest.raises(ProviderError, match="circuit_open"):
        await client.fetch(LOCATIONS)
    assert route.call_count == calls
    clock.advance(settings.circuit_open_s + 1)
    assert client.breaker.state == "half_open"
    route.respond(json=make_payload())
    await client.fetch(LOCATIONS)
    assert client.breaker.state == "closed"


@respx.mock
async def test_local_call_budget_caps_attempts(settings: Settings, clock: FakeClock) -> None:
    route = respx.get(URL).respond(503)
    client = client_for(settings.model_copy(update={"provider_max_calls_per_minute": 2}), clock)
    with pytest.raises(ProviderError) as info:
        await client.fetch(LOCATIONS)
    assert info.value.kind == "budget"
    assert route.call_count == 2


def test_retry_after_parsing() -> None:
    assert parse_retry_after("120") == 120
    assert parse_retry_after(None) is None
    assert parse_retry_after("soon") is None
    assert parse_retry_after("Wed, 21 Oct 2015 07:28:00 GMT", now=1445412470) == 10


def test_backoff_is_bounded_and_grows() -> None:
    import random

    rng = random.Random(1)
    for attempt in range(5):
        for _ in range(50):
            assert 0 <= backoff_delay(attempt, 0.5, rng) <= 0.5 * 2**attempt


def test_budget_window_slides() -> None:
    clock = FakeClock()
    budget = CallBudget(2, clock.now)
    assert budget.try_acquire() and budget.try_acquire()
    assert not budget.try_acquire()
    clock.advance(61)
    assert budget.try_acquire()


def test_half_open_failure_reopens_immediately() -> None:
    clock = FakeClock()
    breaker = CircuitBreaker(threshold=3, open_s=10, now=clock.now)
    for _ in range(3):
        breaker.record_failure()
    clock.advance(11)
    assert breaker.state == "half_open"
    breaker.record_failure()
    assert breaker.state == "open"
