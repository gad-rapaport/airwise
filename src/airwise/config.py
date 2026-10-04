from pathlib import Path
from typing import Literal

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration, read from AIRWISE_* environment variables.

    Defaults are the Slim local profile. See docs/SETUP.md for the meaning of each value and
    docs/DECISIONS.md#cache-policy for the reasoning behind the timings.
    """

    model_config = SettingsConfigDict(env_prefix="AIRWISE_", extra="ignore")

    # "live" talks to the provider; "snapshot" serves the committed snapshot and never calls out.
    provider_mode: Literal["live", "snapshot"] = "live"
    provider_base_url: HttpUrl = HttpUrl("https://air-quality-api.open-meteo.com")
    provider_connect_timeout_s: float = Field(3.0, gt=0, le=30)
    provider_read_timeout_s: float = Field(10.0, gt=0, le=60)
    provider_max_retries: int = Field(2, ge=0, le=5)
    provider_backoff_base_s: float = Field(0.5, ge=0, le=10)
    # Longest Retry-After we are willing to wait for inside one refresh; longer ones start a cooldown.
    provider_max_retry_after_s: float = Field(5.0, ge=0, le=60)
    # Our own budget, far below Open-Meteo's free-tier limits (600 calls per minute, 10,000 per day).
    provider_max_calls_per_minute: int = Field(6, ge=1, le=600)
    circuit_failure_threshold: int = Field(3, ge=1, le=20)
    circuit_open_s: float = Field(300, ge=1, le=3600)

    past_days: int = Field(7, ge=1, le=92)
    forecast_days: int = Field(3, ge=0, le=7)

    fresh_ttl_s: int = Field(1800, ge=60, le=86_400)
    stale_warning_s: int = Field(6 * 3600, ge=60)
    expired_after_s: int = Field(48 * 3600, ge=60)
    retention_days: int = Field(30, ge=1, le=365)

    scheduler_enabled: bool = True
    refresh_interval_s: int = Field(3600, ge=60, le=86_400)
    manual_refresh_cooldown_s: int = Field(120, ge=0, le=3600)

    display_timezone: str = "Asia/Jerusalem"
    db_path: Path = Path("data/airwise.db")
    snapshot_path: Path = Path("data/snapshot/open-meteo-air-quality.json")
    web_dist: Path | None = None
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
