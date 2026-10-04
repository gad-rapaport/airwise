import sqlite3
from pathlib import Path

import pytest

from airwise.cli import backup, restore
from airwise.config import Settings
from airwise.store import FetchInfo, Store


def seed(store: Store, value: float) -> None:
    store.init_sync()
    store._ingest([("tel-aviv", "pm2_5", 1_789_000_000, value)], FetchInfo(1.0, "live", 1, 2, 1), "x", 0)


def stored_value(path: Path) -> float:
    with sqlite3.connect(path) as conn:
        return conn.execute("SELECT value FROM observations").fetchone()[0]


def test_backup_and_restore_round_trip(settings: Settings, tmp_path: Path) -> None:
    store = Store(settings.db_path)
    seed(store, 11.0)
    target = tmp_path / "backups" / "airwise.db"
    backup(settings, target)

    with sqlite3.connect(settings.db_path) as conn:
        conn.execute("UPDATE observations SET value = 99")
    assert stored_value(settings.db_path) == 99

    restore(settings, target)
    assert stored_value(settings.db_path) == 11.0


def test_restore_refuses_foreign_databases(settings: Settings, tmp_path: Path) -> None:
    other = tmp_path / "other.db"
    with sqlite3.connect(other) as conn:
        conn.execute("CREATE TABLE notes (x)")
    with pytest.raises(SystemExit, match="not an Airwise backup"):
        restore(settings, other)
