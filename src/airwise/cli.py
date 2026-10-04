"""Operational commands, run inside the container:

python -m airwise.cli backup /data/backups/airwise-20261004.db
python -m airwise.cli restore /restore/airwise-20261004.db --yes   (app must be stopped)
python -m airwise.cli load-snapshot
python -m airwise.cli healthcheck
"""

import argparse
import asyncio
import sqlite3
import sys
import urllib.request
from pathlib import Path

from airwise.config import Settings
from airwise.service import AirService
from airwise.store import Store

REQUIRED_TABLES = {"observations", "fetches", "refresh_log"}


def backup(settings: Settings, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    Store(settings.db_path).backup_to(target)
    print(f"backup written: {target} ({target.stat().st_size // 1024} KB)")


def restore(settings: Settings, source: Path) -> None:
    # immutable=1: the backup may sit on a read-only mount where SQLite cannot create lock files.
    with sqlite3.connect(f"file:{source}?mode=ro&immutable=1", uri=True) as src:
        tables = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        if not tables >= REQUIRED_TABLES:
            raise SystemExit(f"{source} is not an Airwise backup (missing {REQUIRED_TABLES - tables})")
        if src.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit(f"{source} failed the integrity check")
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        dst = sqlite3.connect(settings.db_path)
        try:
            src.backup(dst)  # page-level copy replaces the whole database atomically
        finally:
            dst.close()
    print(f"restored {source} into {settings.db_path}")


def healthcheck() -> None:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/readyz", timeout=3) as res:
            sys.exit(0 if res.status == 200 else 1)
    except OSError:
        sys.exit(1)


async def load_snapshot(settings: Settings) -> None:
    store = Store(settings.db_path)
    await store.init()
    await AirService(settings, store, None).load_snapshot()
    print("snapshot loaded")


def main() -> None:
    parser = argparse.ArgumentParser(prog="airwise.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    b = sub.add_parser("backup")
    b.add_argument("target", type=Path)
    r = sub.add_parser("restore")
    r.add_argument("source", type=Path)
    r.add_argument("--yes", action="store_true")
    sub.add_parser("load-snapshot")
    sub.add_parser("healthcheck")
    args = parser.parse_args()

    if args.command == "healthcheck":
        healthcheck()
    settings = Settings()
    if args.command == "backup":
        backup(settings, args.target)
    elif args.command == "restore":
        if not args.yes:
            raise SystemExit("restore replaces all Airwise data; re-run with --yes (and stop the app first)")
        restore(settings, args.source)
    elif args.command == "load-snapshot":
        asyncio.run(load_snapshot(settings))


if __name__ == "__main__":
    main()
