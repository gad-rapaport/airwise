"""Small, explicit resilience primitives for one upstream dependency.

Kept in-house rather than pulled from a library: each is a few lines, fully unit tested, and the behaviour
(what counts as a failure, when to stop calling) is part of what this project demonstrates.
"""

import random
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

type Now = Callable[[], float]


class CallBudget:
    """Sliding one-minute window. Protects the provider (and our quota) from bugs or abusive clients."""

    def __init__(self, per_minute: int, now: Now = time.monotonic) -> None:
        self._limit = per_minute
        self._now = now
        self._calls: deque[float] = deque()

    def _trim(self) -> None:
        cutoff = self._now() - 60
        while self._calls and self._calls[0] <= cutoff:
            self._calls.popleft()

    def try_acquire(self) -> bool:
        self._trim()
        if len(self._calls) >= self._limit:
            return False
        self._calls.append(self._now())
        return True

    def used(self) -> int:
        self._trim()
        return len(self._calls)


@dataclass
class CircuitBreaker:
    """Closed -> open after `threshold` consecutive failures; half-open trial after `open_s`."""

    threshold: int
    open_s: float
    now: Now = time.monotonic
    failures: int = 0
    opened_at: float | None = None
    # Earliest moment the next call may be attempted, e.g. from a provider Retry-After header.
    cooldown_until: float = field(default=0.0)

    @property
    def state(self) -> Literal["closed", "open", "half_open"]:
        if self.opened_at is None:
            return "closed"
        return "open" if self.now() - self.opened_at < self.open_s else "half_open"

    def allow(self) -> bool:
        return self.now() >= self.cooldown_until and self.state != "open"

    def blocked_for(self) -> float:
        waits = [self.cooldown_until - self.now()]
        if self.opened_at is not None:
            waits.append(self.opened_at + self.open_s - self.now())
        return max(0.0, *waits)

    def record_success(self) -> None:
        self.failures = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.failures += 1
        if self.state == "half_open" or self.failures >= self.threshold:
            self.opened_at = self.now()

    def cool_down(self, seconds: float) -> None:
        self.cooldown_until = max(self.cooldown_until, self.now() + seconds)


def backoff_delay(attempt: int, base: float, rng: random.Random | None = None) -> float:
    """Exponential backoff with full jitter: uniform(0, base * 2**attempt)."""
    r = rng or random
    return r.uniform(0, base * (2**attempt))
