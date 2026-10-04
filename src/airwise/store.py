"""SQLite persistence for normalised observations and refresh history.

SQLite fits: one writer (the refresh), a few concurrent readers, tens of thousands of rows. WAL mode lets
reads continue during a refresh. Each operation opens its own short-lived connection inside a worker thread,
so the event loop never blocks on disk I/O.
"""

import asyncio
import sqlite3
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

SCHEMA = """
CREATE TABLE IF NOT EXISTS observations (
  location_id TEXT NOT NULL,
  metric      TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  value       REAL,
  PRIMARY KEY (location_id, metric, ts)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS fetches (
  id             INTEGER PRIMARY KEY,
  fetched_at     REAL NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('live', 'snapshot')),
  first_ts       INTEGER NOT NULL,
  last_ts        INTEGER NOT NULL,
  points         INTEGER NOT NULL,
  payload_sha256 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_log (
  id          INTEGER PRIMARY KEY,
  started_at  REAL NOT NULL,
  finished_at REAL NOT NULL,
  reason      TEXT NOT NULL,
  outcome     TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  attempts    INTEGER NOT NULL DEFAULT 0
);
"""

type Source = Literal["live", "snapshot"]
type Row = tuple[str, str, int, float | None]


@dataclass(frozen=True)
class FetchInfo:
    fetched_at: float
    source: Source
    first_ts: int
    last_ts: int
    points: int


@dataclass(frozen=True)
class RefreshRecord:
    started_at: float
    finished_at: float
    reason: str
    outcome: str
    detail: str
    attempts: int


class Store:
    def __init__(self, path: Path) -> None:
        self._path = path

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path, timeout=5)
        try:
            conn.execute("PRAGMA busy_timeout = 5000")
            yield conn
        finally:
            conn.close()

    def init_sync(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)

    async def init(self) -> None:
        await asyncio.to_thread(self.init_sync)

    # ---- writes ----

    def _ingest(self, rows: list[Row], info: FetchInfo, payload_sha256: str, retention_cutoff: int) -> None:
        with self._connect() as conn, conn:  # second `conn` = one transaction
            conn.executemany(
                "INSERT INTO observations (location_id, metric, ts, value) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (location_id, metric, ts) DO UPDATE SET value = excluded.value",
                rows,
            )
            conn.execute(
                "INSERT INTO fetches (fetched_at, source, first_ts, last_ts, points, payload_sha256) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (info.fetched_at, info.source, info.first_ts, info.last_ts, info.points, payload_sha256),
            )
            conn.execute("DELETE FROM observations WHERE ts < ?", (retention_cutoff,))
            conn.execute(
                "DELETE FROM fetches WHERE id NOT IN (SELECT id FROM fetches ORDER BY id DESC LIMIT 200)"
            )

    async def ingest(
        self, rows: list[Row], info: FetchInfo, payload_sha256: str, retention_cutoff: int
    ) -> None:
        await asyncio.to_thread(self._ingest, rows, info, payload_sha256, retention_cutoff)

    def _log_refresh(self, rec: RefreshRecord) -> None:
        with self._connect() as conn, conn:
            conn.execute(
                "INSERT INTO refresh_log (started_at, finished_at, reason, outcome, detail, attempts) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (rec.started_at, rec.finished_at, rec.reason, rec.outcome, rec.detail, rec.attempts),
            )
            conn.execute(
                "DELETE FROM refresh_log WHERE id NOT IN "
                "(SELECT id FROM refresh_log ORDER BY id DESC LIMIT 500)"
            )

    async def log_refresh(self, rec: RefreshRecord) -> None:
        await asyncio.to_thread(self._log_refresh, rec)

    # ---- reads ----

    def _latest_fetch(self) -> FetchInfo | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT fetched_at, source, first_ts, last_ts, points FROM fetches ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return FetchInfo(*row) if row else None

    async def latest_fetch(self) -> FetchInfo | None:
        return await asyncio.to_thread(self._latest_fetch)

    def _observations(self, location_ids: Iterable[str], metric: str, start: int, end: int) -> list[Row]:
        ids = list(location_ids)
        marks = ",".join("?" for _ in ids)
        with self._connect() as conn:
            return conn.execute(
                f"SELECT location_id, metric, ts, value FROM observations "  # noqa: S608 - placeholders only
                f"WHERE metric = ? AND location_id IN ({marks}) AND ts BETWEEN ? AND ? "
                "ORDER BY location_id, ts",
                [metric, *ids, start, end],
            ).fetchall()

    async def observations(self, location_ids: Iterable[str], metric: str, start: int, end: int) -> list[Row]:
        return await asyncio.to_thread(self._observations, list(location_ids), metric, start, end)

    def _latest_values(self, at: int) -> list[Row]:
        """Most recent non-null value at or before `at` for every location and metric."""
        with self._connect() as conn:
            return conn.execute(
                "SELECT o.location_id, o.metric, o.ts, o.value FROM observations o "
                "JOIN (SELECT location_id, metric, max(ts) AS ts FROM observations "
                "      WHERE ts <= ? AND value IS NOT NULL GROUP BY location_id, metric) m "
                "  ON m.location_id = o.location_id AND m.metric = o.metric AND m.ts = o.ts",
                (at,),
            ).fetchall()

    async def latest_values(self, at: int) -> list[Row]:
        return await asyncio.to_thread(self._latest_values, at)

    def _recent_refreshes(self, limit: int) -> list[RefreshRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT started_at, finished_at, reason, outcome, detail, attempts FROM refresh_log "
                "ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [RefreshRecord(*r) for r in rows]

    async def recent_refreshes(self, limit: int = 10) -> list[RefreshRecord]:
        return await asyncio.to_thread(self._recent_refreshes, limit)

    def _ping(self) -> bool:
        with self._connect() as conn:
            conn.execute("SELECT 1").fetchone()
        return True

    async def ping(self) -> bool:
        return await asyncio.to_thread(self._ping)

    def backup_to(self, target: Path) -> None:
        """Consistent copy using SQLite's online backup API (safe while the app is writing)."""
        with self._connect() as src:
            dst = sqlite3.connect(target)
            try:
                src.backup(dst)
                # A backup must be one self-contained file: WAL mode would need -wal/-shm side files.
                dst.execute("PRAGMA journal_mode = DELETE")
            finally:
                dst.close()
