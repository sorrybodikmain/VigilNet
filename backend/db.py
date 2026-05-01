"""PostgreSQL persistence for cameras and app settings."""
from __future__ import annotations
import json, logging, os, time
from dataclasses import asdict
from pathlib import Path
from typing import Any

import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

from config_loader import AppConfig, CameraConfig, TrackingConfig, PTZLimits

log = logging.getLogger(__name__)

_DSN = (
    f"host={os.environ.get('DB_HOST', 'postgres')} "
    f"port={os.environ.get('DB_PORT', '5432')} "
    f"dbname={os.environ.get('DB_NAME', 'camtrack')} "
    f"user={os.environ.get('DB_USER', 'camtrack')} "
    f"password={os.environ.get('DB_PASSWORD', 'camtrack')}"
)

_pool: pg_pool.ThreadedConnectionPool | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS cameras (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'ptz',
    rtsp_4k          TEXT NOT NULL DEFAULT '',
    rtsp_sd          TEXT NOT NULL DEFAULT '',
    ip               TEXT NOT NULL DEFAULT '',
    onvif_url        TEXT,
    position_x       DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    zone_polygon_m   JSONB NOT NULL DEFAULT '[]',
    ptz_limits       JSONB,
    color            TEXT NOT NULL DEFAULT '#00d084',
    split_stream     BOOLEAN NOT NULL DEFAULT FALSE,
    ptz_invert_pan   BOOLEAN NOT NULL DEFAULT FALSE,
    ptz_invert_tilt  BOOLEAN NOT NULL DEFAULT FALSE,
    ptz_tilt_offset  DOUBLE PRECISION NOT NULL DEFAULT 0,
    sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

_MIGRATIONS = [
    "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS ptz_invert_pan  BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS ptz_invert_tilt BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS ptz_tilt_offset DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS split_stream    BOOLEAN NOT NULL DEFAULT FALSE",
]

_DEFAULTS: dict[str, str] = {
    "yard_w":   "20",
    "yard_h":   "15",
    "tracking": json.dumps(asdict(TrackingConfig())),
}


def _connect_with_retry(retries: int = 10, delay: float = 3.0) -> pg_pool.ThreadedConnectionPool:
    for attempt in range(1, retries + 1):
        try:
            p = pg_pool.ThreadedConnectionPool(1, 10, dsn=_DSN)
            log.info("PostgreSQL connection pool ready")
            return p
        except psycopg2.OperationalError as e:
            log.warning(f"DB not ready (attempt {attempt}/{retries}): {e}")
            if attempt < retries:
                time.sleep(delay)
    raise RuntimeError("Could not connect to PostgreSQL after retries")


def _get_conn():
    return _pool.getconn()


def _put_conn(con):
    _pool.putconn(con)


def init() -> None:
    global _pool
    _pool = _connect_with_retry()
    con = _get_conn()
    try:
        with con.cursor() as cur:
            cur.execute(_SCHEMA)
            for sql in _MIGRATIONS:
                cur.execute(sql)
            for key, val in _DEFAULTS.items():
                cur.execute(
                    "INSERT INTO app_settings (key, value) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (key, val),
                )
        con.commit()
    finally:
        _put_conn(con)
    log.info("DB schema ready")


def load() -> AppConfig:
    con = _get_conn()
    try:
        with con.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM cameras ORDER BY sort_order")
            rows = cur.fetchall()

            cameras: list[CameraConfig] = []
            for r in rows:
                raw_limits = r["ptz_limits"]
                if isinstance(raw_limits, str):
                    raw_limits = json.loads(raw_limits)
                ptz_limits = PTZLimits(**raw_limits) if raw_limits else None

                zone = r["zone_polygon_m"]
                if isinstance(zone, str):
                    zone = json.loads(zone)

                cameras.append(CameraConfig(
                    id              = r["id"],
                    name            = r["name"],
                    type            = r["type"],
                    rtsp_4k         = r["rtsp_4k"],
                    rtsp_sd         = r["rtsp_sd"],
                    ip              = r["ip"],
                    onvif_url       = r["onvif_url"],
                    position_m      = {"x": r["position_x"], "y": r["position_y"]},
                    zone_polygon_m  = zone,
                    ptz_limits      = ptz_limits,
                    color           = r["color"],
                    split_stream    = bool(r["split_stream"]),
                    ptz_invert_pan  = bool(r["ptz_invert_pan"]),
                    ptz_invert_tilt = bool(r["ptz_invert_tilt"]),
                    ptz_tilt_offset = float(r["ptz_tilt_offset"] or 0),
                ))

            def _setting(key: str) -> str:
                cur.execute("SELECT value FROM app_settings WHERE key = %s", (key,))
                row = cur.fetchone()
                return row["value"] if row else _DEFAULTS[key]

            yard_w   = float(_setting("yard_w"))
            yard_h   = float(_setting("yard_h"))
            tracking_data = json.loads(_setting("tracking"))

        tracking = TrackingConfig(**{
            k: tracking_data[k] for k in tracking_data if hasattr(TrackingConfig, k)
        })
        return AppConfig(yard_w=yard_w, yard_h=yard_h, cameras=cameras, tracking=tracking)
    finally:
        _put_conn(con)


def save(cfg: AppConfig) -> None:
    con = _get_conn()
    try:
        with con.cursor() as cur:
            cur.execute("DELETE FROM cameras")
            for idx, c in enumerate(cfg.cameras):
                cur.execute(
                    """INSERT INTO cameras
                       (id, name, type, rtsp_4k, rtsp_sd, ip, onvif_url,
                        position_x, position_y, zone_polygon_m, ptz_limits,
                        color, split_stream, ptz_invert_pan, ptz_invert_tilt,
                        ptz_tilt_offset, sort_order)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        c.id, c.name, c.type, c.rtsp_4k, c.rtsp_sd, c.ip, c.onvif_url,
                        c.position_m.get("x", 0), c.position_m.get("y", 0),
                        json.dumps(c.zone_polygon_m),
                        json.dumps(asdict(c.ptz_limits)) if c.ptz_limits else None,
                        c.color,
                        c.split_stream,
                        c.ptz_invert_pan,
                        c.ptz_invert_tilt,
                        c.ptz_tilt_offset,
                        idx,
                    ),
                )
            for key, val in [
                ("yard_w",   str(cfg.yard_w)),
                ("yard_h",   str(cfg.yard_h)),
                ("tracking", json.dumps(asdict(cfg.tracking))),
            ]:
                cur.execute(
                    "INSERT INTO app_settings (key, value) VALUES (%s, %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                    (key, val),
                )
        con.commit()
        log.info(f"Config saved to DB ({len(cfg.cameras)} cameras)")
    except Exception:
        con.rollback()
        raise
    finally:
        _put_conn(con)
