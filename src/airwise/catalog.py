"""Static reference data: locations, metrics and published thresholds."""

from dataclasses import dataclass
from typing import Literal

type MetricId = Literal["pm2_5", "pm10", "nitrogen_dioxide", "ozone", "european_aqi"]
type RegionId = Literal["israel", "east-med"]


@dataclass(frozen=True)
class Location:
    id: str
    name: str
    region: RegionId
    latitude: float
    longitude: float
    timezone: str


@dataclass(frozen=True)
class Metric:
    id: MetricId
    label: str
    short: str
    unit: str
    # WHO 2021 air quality guideline for the stated averaging period, if one exists.
    guideline: float | None
    guideline_period: str | None


REGIONS: dict[RegionId, str] = {"israel": "Israel", "east-med": "Eastern Mediterranean"}

LOCATIONS: tuple[Location, ...] = (
    Location("tel-aviv", "Tel Aviv-Yafo", "israel", 32.0853, 34.7818, "Asia/Jerusalem"),
    Location("jerusalem", "Jerusalem", "israel", 31.7683, 35.2137, "Asia/Jerusalem"),
    Location("haifa", "Haifa", "israel", 32.7940, 34.9896, "Asia/Jerusalem"),
    Location("beer-sheva", "Be'er Sheva", "israel", 31.2520, 34.7915, "Asia/Jerusalem"),
    Location("eilat", "Eilat", "israel", 29.5577, 34.9519, "Asia/Jerusalem"),
    Location("tiberias", "Tiberias", "israel", 32.7959, 35.5310, "Asia/Jerusalem"),
    Location("athens", "Athens", "east-med", 37.9838, 23.7275, "Europe/Athens"),
    Location("nicosia", "Nicosia", "east-med", 35.1856, 33.3823, "Asia/Nicosia"),
    Location("cairo", "Cairo", "east-med", 30.0444, 31.2357, "Africa/Cairo"),
    Location("istanbul", "Istanbul", "east-med", 41.0082, 28.9784, "Europe/Istanbul"),
)
LOCATIONS_BY_ID = {loc.id: loc for loc in LOCATIONS}

METRICS: tuple[Metric, ...] = (
    Metric("pm2_5", "Fine particles (PM2.5)", "PM2.5", "µg/m³", 15.0, "24-hour mean"),
    Metric("pm10", "Coarse particles (PM10)", "PM10", "µg/m³", 45.0, "24-hour mean"),
    Metric("nitrogen_dioxide", "Nitrogen dioxide (NO₂)", "NO₂", "µg/m³", 25.0, "24-hour mean"),
    Metric("ozone", "Ozone (O₃)", "O₃", "µg/m³", 100.0, "8-hour mean"),
    Metric("european_aqi", "European Air Quality Index", "EAQI", "index", None, None),
)
METRICS_BY_ID = {m.id: m for m in METRICS}

# Units Open-Meteo reports for each requested variable. A mismatch means the provider changed its contract.
PROVIDER_UNITS: dict[str, set[str]] = {
    "pm2_5": {"μg/m³", "µg/m³"},
    "pm10": {"μg/m³", "µg/m³"},
    "nitrogen_dioxide": {"μg/m³", "µg/m³"},
    "ozone": {"μg/m³", "µg/m³"},
    "european_aqi": {"EAQI"},
}

# European Air Quality Index bands as published by the European Environment Agency.
EAQI_BANDS: tuple[tuple[float, str], ...] = (
    (20, "Good"),
    (40, "Fair"),
    (60, "Moderate"),
    (80, "Poor"),
    (100, "Very poor"),
    (float("inf"), "Extremely poor"),
)


def eaqi_band(value: float | None) -> str | None:
    if value is None:
        return None
    for upper, label in EAQI_BANDS:
        if value <= upper:
            return label
    return None  # pragma: no cover - the last band is unbounded
