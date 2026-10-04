"""HTTP client for the Open-Meteo Air Quality API with bounded retries and protective limits."""

import asyncio
import email.utils
import logging
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Literal

import httpx
from pydantic import ValidationError

from airwise.catalog import PROVIDER_UNITS, Location
from airwise.config import Settings
from airwise.provider.resilience import CallBudget, CircuitBreaker, backoff_delay
from airwise.provider.schema import ProviderPayload

log = logging.getLogger("airwise.provider")

type FailureKind = Literal["timeout", "network", "http", "rate_limited", "schema", "circuit_open", "budget"]

ENDPOINT = "/v1/air-quality"
USER_AGENT = "Airwise/0.1 (portfolio demo; contact via repository)"


@dataclass
class ProviderError(Exception):
    kind: FailureKind
    detail: str
    retry_after: float | None = None

    def __str__(self) -> str:
        return f"{self.kind}: {self.detail}"


def parse_retry_after(value: str | None, now: float | None = None) -> float | None:
    """Retry-After is either delta-seconds or an HTTP date."""
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return float(value)
    try:
        when = email.utils.parsedate_to_datetime(value)
    except TypeError, ValueError:
        return None
    return max(0.0, when.timestamp() - (now if now is not None else time.time()))


def build_params(locations: Sequence[Location], settings: Settings) -> dict[str, str]:
    return {
        "latitude": ",".join(f"{loc.latitude:.4f}" for loc in locations),
        "longitude": ",".join(f"{loc.longitude:.4f}" for loc in locations),
        "hourly": ",".join(PROVIDER_UNITS),
        "past_days": str(settings.past_days),
        "forecast_days": str(settings.forecast_days),
        "timezone": "GMT",
        # Unix seconds remove any ambiguity about the time zone of the returned timestamps.
        "timeformat": "unixtime",
        "domains": "auto",
    }


class ProviderClient:
    def __init__(
        self,
        settings: Settings,
        http: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self._settings = settings
        self._http = http or httpx.AsyncClient(
            base_url=str(settings.provider_base_url),
            timeout=httpx.Timeout(
                settings.provider_read_timeout_s, connect=settings.provider_connect_timeout_s
            ),
            headers={"user-agent": USER_AGENT, "accept": "application/json"},
            # One upstream; a tiny pool prevents connection storms if something loops.
            limits=httpx.Limits(max_connections=2, max_keepalive_connections=1),
            follow_redirects=False,
        )
        self._sleep = sleep
        self.budget = CallBudget(settings.provider_max_calls_per_minute, now)
        self.breaker = CircuitBreaker(settings.circuit_failure_threshold, settings.circuit_open_s, now)
        self.last_attempts = 0

    async def aclose(self) -> None:
        await self._http.aclose()

    async def fetch(self, locations: Sequence[Location]) -> ProviderPayload:
        """One logical fetch: up to 1 + max_retries HTTP attempts, each counted against the budget."""
        if not self.breaker.allow():
            raise ProviderError(
                "circuit_open",
                f"provider calls paused for {self.breaker.blocked_for():.0f} s after repeated failures",
                retry_after=self.breaker.blocked_for(),
            )
        params = build_params(locations, self._settings)
        last_error: ProviderError | None = None
        self.last_attempts = 0
        for attempt in range(self._settings.provider_max_retries + 1):
            if not self.budget.try_acquire():
                raise ProviderError("budget", "local call budget for this minute is used up", retry_after=60)
            self.last_attempts += 1
            try:
                payload = await self._attempt(params, expected=len(locations))
            except ProviderError as err:
                last_error = err
                retryable = err.kind in {"timeout", "network", "http", "rate_limited"}
                too_long = (
                    err.retry_after is not None
                    and err.retry_after > self._settings.provider_max_retry_after_s
                )
                if err.kind == "rate_limited" and err.retry_after:
                    self.breaker.cool_down(err.retry_after)
                if not retryable or too_long or attempt == self._settings.provider_max_retries:
                    break
                delay = err.retry_after or backoff_delay(attempt, self._settings.provider_backoff_base_s)
                log.warning("provider attempt %d failed (%s); retrying in %.2f s", attempt + 1, err, delay)
                await self._sleep(delay)
                continue
            self.breaker.record_success()
            return payload
        assert last_error is not None
        # Schema errors are a contract problem, not an outage; they still count so that a broken API
        # is not called again and again.
        self.breaker.record_failure()
        raise last_error

    async def _attempt(self, params: dict[str, str], expected: int) -> ProviderPayload:
        try:
            response = await self._http.get(ENDPOINT, params=params)
        except httpx.TimeoutException as exc:
            raise ProviderError("timeout", type(exc).__name__) from exc
        except httpx.TransportError as exc:
            raise ProviderError("network", type(exc).__name__) from exc

        if response.status_code == 429:
            raise ProviderError(
                "rate_limited",
                "provider returned 429",
                parse_retry_after(response.headers.get("retry-after")),
            )
        if response.status_code >= 500:
            raise ProviderError("http", f"provider returned {response.status_code}")
        if response.status_code != 200:
            reason = _error_reason(response)
            # 4xx other than 429 means our request is wrong; retrying will not help.
            raise ProviderError("schema", f"provider rejected the request ({response.status_code}): {reason}")
        if len(response.content) > 5_000_000:
            raise ProviderError("schema", "response larger than 5 MB")
        try:
            payload = ProviderPayload.model_validate_json(response.content)
        except ValidationError as exc:
            first = exc.errors()[0]
            where = ".".join(str(p) for p in first["loc"])
            raise ProviderError("schema", f"invalid response at {where}: {first['msg']}") from exc
        if len(payload.root) != expected:
            raise ProviderError("schema", f"expected {expected} locations, got {len(payload.root)}")
        return payload


def _error_reason(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return "no details"
    reason = body.get("reason") if isinstance(body, dict) else None
    return str(reason)[:200] if reason else "no details"
