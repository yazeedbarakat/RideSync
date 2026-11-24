"""AI feature 2: smart ride matching.

Small exhaustive search: take the nearest compatible students, try every car of 4
(then 3), keep the valid one with the least walking and time spread.
"""
import hashlib
from itertools import combinations
from math import ceil

from . import config as c
from .geo import haversine_m

POOL = 12  # nearest candidates to consider: C(12,3) = 220 cars at most


def walk_m(a, b):
    return haversine_m(a["lat"], a["lon"], b["lat"], b["lon"]) * c.ROAD_FACTOR


def group_ok(group) -> bool:
    """Same campus, arrival window, and women-only respected for EVERY rider."""
    if len({r["campus"] for r in group}) != 1 or len(group) > c.MAX_RIDERS_PER_CAR:
        return False
    if any(r["women_only"] for r in group) and any(r["gender"] != "F" for r in group):
        return False
    times = [r["desired_arrival"] for r in group]
    return max(times) - min(times) <= c.ARRIVAL_WINDOW_MIN


def best_group(me, candidates, now):
    near = sorted((s for s in candidates if group_ok([me, s]) and walk_m(me, s) <= 2 * c.MAX_WALK_M),
                  key=lambda s: (walk_m(me, s), s["id"]))[:POOL]
    for size in range(c.MAX_RIDERS_PER_CAR, c.MIN_RIDERS_PER_CAR - 1, -1):
        best = None
        for others in combinations(near, size - 1):
            group = [me, *others]
            if not group_ok(group):
                continue
            pickup = {"lat": sum(r["lat"] for r in group) / size, "lon": sum(r["lon"] for r in group) / size}
            walks = [walk_m(r, pickup) for r in group]
            if max(walks) > c.MAX_WALK_M:
                continue
            times = [r["desired_arrival"] for r in group]
            arrive = min(times)
            campus = c.CAMPUSES[me["campus"]]
            km = haversine_m(pickup["lat"], pickup["lon"], campus["lat"], campus["lon"]) / 1000 * c.ROAD_FACTOR
            depart = arrive - ceil(km / c.RIDE_SPEED_KMH * 60)
            if depart < now + max(walks) / c.WALK_SPEED_M_PER_MIN:
                continue
            score = sum(walks) + 50 * (max(times) - arrive)  # 1 min of spread ~ 50 m of walking
            if best is None or score < best["score"]:
                best = {"score": score, "group": group, "pickup": pickup, "walks": walks,
                        "arrive": arrive, "depart": depart, "km": km}
        if best:
            return best
    return None


def find(me, candidates, now):
    """Best car for the student's time, else the closest earlier one: (match, minutes earlier)."""
    for earlier in range(0, c.MAX_EARLIER_MIN + 1, c.EARLIER_STEP_MIN):
        m = best_group({**me, "desired_arrival": me["desired_arrival"] - earlier}, candidates, now)
        if m:
            return m, earlier
    return None, 0


def replacement(rest, candidates, pickup, arrive, depart, now):
    """Closest student who can take a free seat without moving the pickup point or the times."""
    ids = {r["id"] for r in rest}
    ok = [s for s in candidates if s["id"] not in ids and s["desired_arrival"] >= arrive and group_ok([*rest, s])
          and (w := walk_m(s, pickup)) <= c.MAX_WALK_M and now + w / c.WALK_SPEED_M_PER_MIN <= depart]
    return min(ok, key=lambda s: (walk_m(s, pickup), s["id"]), default=None)


def crew(group) -> dict:
    """The parts of a ride that depend on who is in it. First names only."""
    n = len(group)
    return {"riders": n, "others": [{"name": r["first_name"]} for r in group[1:]],
            "women_only": all(r["gender"] == "F" for r in group) and any(r["women_only"] for r in group),
            "seat_price": c.seat_price(n), "prices": c.price_comparison(n)}


def to_ride(m, me, day="today"):
    """Public view of a match: never another student's location."""
    group = m["group"]
    rid = hashlib.sha256(repr((day, [(r["id"], m["depart"], me["campus"]) for r in group])).encode()).hexdigest()[:12]
    return {
        "id": rid, "day": day, "campus": me["campus"], **crew(group),
        "pickup": {"lat": round(m["pickup"]["lat"], 5), "lon": round(m["pickup"]["lon"], 5),
                   "label": f"{c.HOODS[me['hood']][0]} meeting point", "walk_m": round(m["walks"][0] / 10) * 10},
        "depart": c.min_to_hhmm(m["depart"]), "arrive": c.min_to_hhmm(m["arrive"]),
        "distance_km": round(m["km"], 1),
        "max_seat_price": c.seat_price(c.MIN_RIDERS_PER_CAR),
    }
