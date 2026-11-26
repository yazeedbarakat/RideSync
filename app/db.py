import sqlite3
from contextlib import contextmanager

from . import config

SCHEMA = """
CREATE TABLE students (
  id INTEGER PRIMARY KEY, first_name TEXT, gender TEXT, hood TEXT, lat REAL, lon REAL,
  campus TEXT, lecture_min INTEGER, desired_arrival INTEGER);
CREATE TABLE bus_obs (
  day INTEGER, route TEXT, from_stop INTEGER, to_stop INTEGER, filling INTEGER,
  minute REAL, elapsed REAL, occ REAL, rain INTEGER, dow INTEGER, nominal REAL,
  y_minutes REAL, y_occ REAL);
CREATE TABLE live_buses (
  id TEXT PRIMARY KEY, route TEXT, from_stop INTEGER, filling INTEGER,
  minute REAL, elapsed REAL, occ REAL, rain INTEGER, dow INTEGER);
CREATE TABLE sessions (id TEXT PRIMARY KEY, profile TEXT, balance REAL DEFAULT 0);
CREATE TABLE rides (id TEXT, session TEXT, day TEXT, data TEXT, joined INTEGER DEFAULT 0, PRIMARY KEY (id, session));
CREATE TABLE dropped (session TEXT, student INTEGER, PRIMARY KEY (session, student));
CREATE TABLE reports (
  session TEXT, bus TEXT, minute REAL, from_stop INTEGER, filling INTEGER, occ REAL, PRIMARY KEY (session, bus, minute));
CREATE TABLE chat (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT, ride TEXT, who TEXT, text TEXT);
"""


@contextmanager
def connect():
    con = sqlite3.connect(config.DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        with con:  # commit on success, roll back on error
            yield con
    finally:
        con.close()


def all_rows(sql, args=()):
    with connect() as con:
        return [dict(r) for r in con.execute(sql, args)]


def one(sql, args=()):
    rows = all_rows(sql, args)
    return rows[0] if rows else None


def clear_session(session_id):
    """Restart one visitor's demo: rides, chat, drop-outs, bus reports and balance."""
    with connect() as con:
        for table in ("rides", "dropped", "reports", "chat"):
            con.execute(f"DELETE FROM {table} WHERE session = ?", (session_id,))
        con.execute("UPDATE sessions SET balance = 0 WHERE id = ?", (session_id,))


def execute(sql, args=()):
    with connect() as con:
        return con.execute(sql, args).rowcount
