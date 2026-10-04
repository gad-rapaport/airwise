"""Pure data processing: windowing, daily means with a coverage rule, and summary values."""

from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

type Point = tuple[int, float | None]

# A daily mean is only reported when at least this many hourly values exist for the day. Below that, a partial
# day (for example the current day) would produce a misleading number.
MIN_HOURS_FOR_DAILY_MEAN = 18


def daily_means(points: Iterable[Point], tz: ZoneInfo) -> list[Point]:
    """Group hourly points by local calendar day; returns (unix ts of local midnight, mean or None)."""
    buckets: dict[datetime, list[float]] = defaultdict(list)
    days: list[datetime] = []
    for ts, value in points:
        local = datetime.fromtimestamp(ts, UTC).astimezone(tz)
        day = local.replace(hour=0, minute=0, second=0, microsecond=0)
        if day not in buckets:
            days.append(day)
            buckets[day] = []
        if value is not None:
            buckets[day].append(value)
    result: list[Point] = []
    for day in days:
        values = buckets[day]
        mean = round(sum(values) / len(values), 1) if len(values) >= MIN_HOURS_FOR_DAILY_MEAN else None
        result.append((int(day.timestamp()), mean))
    return result


def window_bounds(now: int, hours_back: int, include_forecast: bool, last_ts: int) -> tuple[int, int]:
    start = now - hours_back * 3600
    end = last_ts if include_forecast else now
    return start, max(start, end)


def mean(values: Iterable[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return round(sum(present) / len(present), 1) if present else None
