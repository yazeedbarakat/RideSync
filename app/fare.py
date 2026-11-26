"""Trip time and fare: the LTRC smart-app tariff over a traffic-aware road model.

Ported from NextStop's reference model (docs/reference/fare_model.py, SPEC v5 §4) for one
pickup stop and one drop-off: a Sync car meets at one point and drives to campus.
Times are minutes after midnight, Amman local time.
"""
from math import ceil

from . import config as c
from .geo import haversine_m


def up05(x: float) -> float:
    """Round up to the next 0.05 JD (avoids float noise like 1.9000000001)."""
    step = round(c.SHARE_STEP_JD * 100)
    return ceil(round(x * 100, 6) / step) * step / 100


def leg_km(lat: float, lon: float, campus: str) -> tuple[float, float]:
    """(urban km, highway km) from a point to a campus. JUST goes via the Irbid-Ramtha road exit."""
    to = c.CAMPUSES[campus]
    if campus != "JUST":
        return round(haversine_m(lat, lon, to["lat"], to["lon"]) / 1000 * c.CIRCUITY_URBAN, 1), 0.0
    ex = c.ROAD_EXIT
    return (round(haversine_m(lat, lon, *ex) / 1000 * c.CIRCUITY_URBAN, 1),
            round(haversine_m(*ex, to["lat"], to["lon"]) / 1000 * c.CIRCUITY_HIGHWAY, 1))


def factors(minute: float, dow: int = c.DEMO_DOW) -> tuple[float, float]:
    h = (minute % 1440) / 60
    u, w = 1.0, 1.0
    for (h0, u0, w0), (h1, u1, w1) in zip(c.TRAFFIC, c.TRAFFIC[1:]):
        if h0 <= h <= h1:
            f = (h - h0) / (h1 - h0)
            u, w = u0 + (u1 - u0) * f, w0 + (w1 - w0) * f
            break
    if dow in c.WEEKEND_DOW:
        u, w = 1 + (u - 1) * 0.5, 1 + (w - 1) * 0.5
    return u, w


def drive(km: tuple[float, float], start: float, dow: int = c.DEMO_DOW) -> dict:
    """Pickup at `start`, drive the leg, drop off. Same meter logic as a taxi: slow traffic
    is billed at the waiting rate, and so are the stops."""
    urban, hw = km
    fu, fh = factors(start + c.DWELL_PICKUP_MIN, dow)
    free = urban / c.SPEED_URBAN_KMH * 60 + hw / c.SPEED_HIGHWAY_KMH * 60
    moving = urban / c.SPEED_URBAN_KMH * 60 * fu + hw / c.SPEED_HIGHWAY_KMH * 60 * fh
    wait = (moving - free) + c.DWELL_PICKUP_MIN + c.DWELL_DROP_MIN
    tf = c.TARIFF_NIGHT if (start % 1440) < c.NIGHT_UNTIL_H * 60 else c.TARIFF_DAY
    fare = max(c.MIN_FARE_JD, c.CALIBRATION * (tf["flag"] + (urban + hw) * tf["km"] + wait * tf["wait"]))
    drop = start + c.DWELL_PICKUP_MIN + moving
    return {"km": round(urban + hw, 1), "fare": round(fare, 2), "drop": drop,
            "minutes": drop + c.DWELL_DROP_MIN - start}


def plan(km: tuple[float, float], deadline: float, dow: int = c.DEMO_DOW) -> dict:
    """Latest whole-minute pickup that drops off by `deadline` (SPEC §3.6)."""
    t = deadline - 60
    for _ in range(6):  # converge: travel time depends on when you leave
        t += deadline - drive(km, t, dow)["drop"]
    t = int(t) + 1
    while drive(km, t, dow)["drop"] > deadline + 1 / 60:
        t -= 1
    return {"pickup": t, **drive(km, t, dow)}


def trip(lat: float, lon: float, campus: str, deadline: float, dow: int = c.DEMO_DOW) -> dict:
    return plan(leg_km(lat, lon, campus), deadline, dow)


def share(fare: float, riders: int, credit: float = 0.0) -> float:
    """What each rider pays: (full fare - credits) / riders, rounded up to 0.05."""
    return up05(max(0.0, fare - credit) / max(1, riders))
