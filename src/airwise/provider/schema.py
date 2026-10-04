"""Strict model of the subset of the Open-Meteo response that Airwise relies on.

Anything outside this contract (missing variables, mismatched array lengths, non-UTC offsets, unexpected
units) is rejected before it can reach the database. Unknown extra fields are ignored so additive changes on
the provider side do not break us.
"""

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator

from airwise.catalog import PROVIDER_UNITS

MAX_POINTS = 24 * 100  # 92 past days + 7 forecast days at most


class Hourly(BaseModel):
    model_config = ConfigDict(extra="ignore")

    time: list[int] = Field(min_length=1, max_length=MAX_POINTS)
    pm2_5: list[float | None]
    pm10: list[float | None]
    nitrogen_dioxide: list[float | None]
    ozone: list[float | None]
    european_aqi: list[float | None]

    @model_validator(mode="after")
    def arrays_align(self) -> Self:
        n = len(self.time)
        for name in PROVIDER_UNITS:
            values: list[float | None] = getattr(self, name)
            if len(values) != n:
                raise ValueError(f"hourly.{name} has {len(values)} values for {n} timestamps")
        if any(b <= a for a, b in zip(self.time, self.time[1:], strict=False)):
            raise ValueError("hourly.time is not strictly increasing")
        if any(v is not None and v < 0 for name in PROVIDER_UNITS for v in getattr(self, name)):
            raise ValueError("negative concentration in hourly data")
        return self


class LocationPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    utc_offset_seconds: int
    generationtime_ms: float | None = None
    hourly_units: dict[str, str]
    hourly: Hourly

    @model_validator(mode="after")
    def utc_and_units(self) -> Self:
        if self.utc_offset_seconds != 0:
            raise ValueError("expected UTC timestamps (utc_offset_seconds=0)")
        for name, allowed in PROVIDER_UNITS.items():
            unit = self.hourly_units.get(name)
            if unit not in allowed:
                raise ValueError(f"unexpected unit for {name}: {unit!r}")
        return self


class ProviderPayload(RootModel[list[LocationPayload]]):
    """Open-Meteo returns a list when several coordinates are requested and an object for one."""

    @model_validator(mode="before")
    @classmethod
    def wrap_single(cls, data: object) -> object:
        return [data] if isinstance(data, dict) else data
