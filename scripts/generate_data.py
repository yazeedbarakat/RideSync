"""Build data/ridesync.db: synthetic students, bus history and the demo scenario.

Everything is seeded, so the demo is identical on every run. All data is synthetic.
Run: python -m scripts.generate_data
"""
import json
import math
import os
import random
import sqlite3

from app import config as c
from app.db import SCHEMA

DAYS = 14
FEMALE = ["Sara", "Lina", "Rania", "Dana", "Nour", "Hala", "Aya", "Tala", "Reem", "Jana", "Maha", "Yara"]
MALE = ["Omar", "Khaled", "Yousef", "Zaid", "Tareq", "Laith", "Hamza", "Sami", "Faris", "Anas", "Bilal", "Qais"]


def bump(t, centre, width):
    return math.exp(-(((t - centre) / width) ** 2))


def demand(t):
    """Students arriving at a station per minute: peaks before 8:00, 9:30 and 11:00 lectures."""
    return 0.7 + 1.5 * bump(t, 435, 30) + 0.8 * bump(t, 525, 30) + 0.6 * bump(t, 615, 35)


def congestion(t):
    return 1 + 0.45 * bump(t, 465, 35) + 0.2 * bump(t, 540, 40)


def poisson(rng, lam):
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l:
            return k
        k += 1


def simulate_trip(rng, day, route, t0, rain, day_factor):
    """One bus: waits until nearly full, then drives. Returns training rows."""
    nominal = [leg["minutes"] * c.BUS_SLOWDOWN for leg in route["legs"]]
    cap, t, riders = c.BUS_CAPACITY, float(t0), 0
    snaps, target = [], cap * rng.uniform(0.6, 0.9)
    snap_at = {0, rng.randint(3, 8), rng.randint(9, 16)}
    while riders < target and t - t0 < 35:
        if int(t - t0) in snap_at:
            snaps.append((0, 1, t, t - t0, riders / cap))
        riders = min(cap, riders + poisson(rng, demand(t)))
        t += 1
    stops = [(t, riders / cap)]  # (departure time, occupancy on leaving)
    for i, base in enumerate(nominal):
        snaps.append((i, 0, t, t - t0, riders / cap))
        t += base * congestion(t) * day_factor * (1.12 if rain else 1) * rng.lognormvariate(0, 0.07)
        if i < len(nominal) - 1:
            got_on = poisson(rng, demand(t) * 3.5)
            riders = min(cap, max(0, riders - poisson(rng, 1.5)) + got_on)
            t += 0.6 + got_on * 0.06
        stops.append((t, riders / cap))
    rows = []
    for frm, filling, when, elapsed, occ in snaps:
        for to in range(frm if filling else frm + 1, len(stops)):
            rows.append((day, route["id"], frm, to, filling, when, elapsed, occ, rain, day % 5,
                         sum(nominal[frm:to]), stops[to][0] - when, stops[to][1]))
    return rows


def make_history(rng, routes):
    rows = []
    for day in range(DAYS):
        rain, day_factor = int(rng.random() < 0.2), rng.lognormvariate(0, 0.05)
        for route in routes:
            t = 360 + rng.randint(0, 8)
            while t < 13 * 60:
                rows += simulate_trip(rng, day, route, t, rain, day_factor)
                t += rng.randint(11, 18)
    return rows


# Buses on the road at DEMO_NOW (07:05 = minute 425). These are INPUTS; arrival and
# crowding shown in the demo are predicted from them by the model.
# id, route, from_stop, filling, minute observed, minutes since opened, occupancy, rain, dow
LIVE_BUSES = [
    ("B1", "R1", 1, 0, 421, 33, 0.96, 0, 1),
    ("B2", "R2", 0, 1, 425, 4, 0.22, 0, 1),
    ("B3", "R3", 1, 0, 423, 25, 0.82, 0, 1),
    ("B4", "R3", 0, 1, 425, 8, 0.34, 0, 1),
]


def jitter(rng, lat, lon, metres):
    return (lat + rng.gauss(0, metres) / 111_320,
            lon + rng.gauss(0, metres) / (111_320 * math.cos(math.radians(lat))))


def make_students(rng, n=400):
    out, hoods = [], list(c.HOODS)
    for _ in range(n):
        hood = rng.choice(hoods)
        _, lat, lon = c.HOODS[hood]
        gender = rng.choice("FM")
        lecture = rng.choices([480, 540, 570, 660], [40, 25, 20, 15])[0]
        out.append((rng.choice(FEMALE if gender == "F" else MALE), gender, hood,
                    *jitter(rng, lat, lon, 350), rng.choices(["JUST", "YU"], [65, 35])[0], lecture,
                    lecture - rng.choice([5, 10, 10, 15, 20]), int(gender == "F" and rng.random() < 0.35)))
    # Seeded neighbours so the two demo personas always have a full car available.
    _, lat, lon = c.HOODS["andalus"]
    for name, g, dlat, dlon, want, wo in [
        ("Omar", "M", .0006, .0005, 468, 0), ("Rania", "F", -.0005, .0007, 470, 0),
        ("Zaid", "M", .0004, -.0008, 472, 0),
        ("Dana", "F", -.0012, -.0010, 469, 1), ("Aya", "F", .0013, .0011, 471, 1),
        ("Tala", "F", -.0011, .0014, 470, 0),
    ]:
        out.append((name, g, "andalus", lat + dlat, lon + dlon, "JUST", 480, want, wo))
    return [(i + 1, *s) for i, s in enumerate(out)]


REGISTRY = [  # mock university registry: gender comes from here, never from the client
    ("ahmad@cit.just.edu.jo", "Ahmad", "M", "andalus", "08:00"),
    ("lina@cit.just.edu.jo", "Lina", "F", "andalus", "08:00"),
]


def build():
    rng = random.Random(c.SEED)
    routes = json.loads(c.ROUTES_PATH.read_text())
    c.DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = c.DB_PATH.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    con = sqlite3.connect(tmp)
    con.executescript(SCHEMA)

    def insert(table, rows):
        con.executemany(f"INSERT INTO {table} VALUES ({','.join('?' * len(rows[0]))})", rows)

    history = make_history(rng, routes)
    insert("bus_obs", history)
    students = make_students(rng)
    insert("students", students)
    insert("live_buses", LIVE_BUSES)
    insert("registry", REGISTRY)
    con.commit()
    con.close()
    os.replace(tmp, c.DB_PATH)  # atomic: never leave a half-built database behind
    print(f"{len(history)} bus observations, {len(students)} students -> {c.DB_PATH}")


if __name__ == "__main__":
    build()
