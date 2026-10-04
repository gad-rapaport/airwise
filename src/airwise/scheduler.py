"""In-process refresh loop. Runs only while the service runs; there is no external cron to forget about."""

import asyncio
import logging
import random

from airwise.service import AirService

log = logging.getLogger("airwise.scheduler")


async def refresh_loop(service: AirService, stop: asyncio.Event, first_delay_s: float = 5.0) -> None:
    rng = random.Random()  # noqa: S311 - jitter, not security
    delay = first_delay_s
    while True:
        try:
            await asyncio.wait_for(stop.wait(), timeout=delay)
            return
        except TimeoutError:
            pass
        try:
            await tick(service)
        except Exception:  # the loop must survive anything a single tick does
            log.exception("scheduled refresh tick failed")
        # +-10 % jitter keeps several instances from aligning on the provider.
        delay = service.settings.refresh_interval_s * rng.uniform(0.9, 1.1)


async def tick(service: AirService) -> str:
    """One scheduled decision. Returns what happened, for tests and logs."""
    latest = await service.store.latest_fetch()
    if latest is None:
        await service.ensure_data()
        return "initial"
    age = service._wall() - latest.fetched_at
    if latest.source == "live" and age < service.settings.fresh_ttl_s:
        log.info("scheduled refresh skipped: data is %.0f s old", age)
        return "skipped-fresh"
    if service.client is not None and not service.client.breaker.allow():
        log.info(
            "scheduled refresh skipped: provider paused for %.0f s", service.client.breaker.blocked_for()
        )
        return "skipped-paused"
    outcome = await service.refresh("scheduled")
    return outcome.outcome
