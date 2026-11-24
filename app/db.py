import sqlite3
from contextlib import contextmanager

from . import config

SCHEMA = """
CREATE TABLE students (
  id INTEGER PRIMARY KEY, first_name TEXT, gender TEXT, hood TEXT, lat REAL, lon REAL,
  campus TEXT, lecture_min INTEGER, desired_arrival INTEGER, women_only INTEGER);
CREATE TABLE bus_obs (
  day INTEGER, route TEXT, from_stop INTEGER, to_stop INTEGER, filling INTEGER,
  minute REAL, elapsed REAL, occ REAL, rain INTEGER, dow INTEGER, nominal REAL,
  y_minutes REAL, y_occ REAL);
CREATE TABLE live_buses (
  id TEXT PRIMARY KEY, route TEXT, from_stop INTEGER, filling INTEGER,
  minute REAL, elapsed REAL, occ REAL, rain INTEGER, dow INTEGER);
CREATE TABLE registry (
  email TEXT PRIMARY KEY, first_name TEXT, gender TEXT, hood TEXT, lecture TEXT);
CREATE TABLE sessions (id TEXT PRIMARY KEY, profile TEXT);
CREATE TABLE rides (
  id TEXT, session TEXT, body TEXT, joined INTEGER DEFAULT 0, PRIMARY KEY (id, session));
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


def execute(sql, args=()):
    with connect() as con:
        return con.execute(sql, args).rowcount
