"""Ride matching: rules-based, on the server.

Small exhaustive search: take the nearest compatible riders, try every car of 4 (then 3),
keep the valid one with the least walking and time spread. Everyone in a car has the
same gender, the same destination and an arrive-by within ARRIVAL_WINDOW_MIN.
"""
import hashlib
from itertools import combinations

from . import config as c
from . import fare
from .geo import haversine_m

POOL = 12  # nearest candidates to consider: C(12,3) = 220 cars at most


def walk_m(a, b):
    return haversine_m(a["lat"], a["lon"], b["lat"], b["lon"]) * c.ROAD_FACTOR


def group_ok(group) -> bool:
    """Same campus, same gender, arrival window, at most 4."""
    if len({r["campus"] for r in group}) != 1 or len({r["gender"] for r in group}) != 1:
        return False
    if len(group) > c.MAX_RIDERS_PER_CAR:
        return False
    times = [r["desired_arrival"] for r in group]
    return max(times) - min(times) <= c.ARRIVAL_WINDOW_MIN


def best_group(me, candidates, now, seats=c.MAX_RIDERS_PER_CAR):
    near = sorted((s for s in candidates if group_ok([me, s]) and walk_m(me, s) <= 2 * c.MAX_WALK_M),
                  key=lambda s: (walk_m(me, s), s["id"]))[:POOL]
    for size in range(seats, c.MIN_RIDERS_PER_CAR - 1, -1):
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
            trip = fare.trip(pickup["lat"], pickup["lon"], me["campus"], min(times))
            if trip["pickup"] < now + c.JOIN_LEAD_MIN:  # joining closes 45 min before pickup
                continue
            score = sum(walks) + 50 * (max(times) - min(times))  # 1 min of spread ~ 50 m of walking
            if best is None or score < best["score"]:
                best = {"score": score, "group": group, "pickup": pickup, "walks": walks,
                        "arrive": round(trip["drop"]), "depart": trip["pickup"], "km": trip["km"],
                        "minutes": round(trip["minutes"]), "fare": trip["fare"]}
        if best:
            return best
    return None


def find(me, candidates, now, seats=c.MAX_RIDERS_PER_CAR):
    """Best car for the rider's time, else the closest earlier one: (match, minutes earlier)."""
    for earlier in range(0, c.MAX_EARLIER_MIN + 1, c.EARLIER_STEP_MIN):
        m = best_group({**me, "desired_arrival": me["desired_arrival"] - earlier}, candidates, now, seats)
        if m:
            return m, earlier
    return None, 0


def replacement(rest, candidates, pickup, arrive, depart, now):
    """Closest rider who can take a free seat without moving the pickup point or the times."""
    ids = {r["id"] for r in rest}
    ok = [s for s in candidates if s["id"] not in ids and s["desired_arrival"] >= arrive and group_ok([*rest, s])
          and (w := walk_m(s, pickup)) <= c.MAX_WALK_M and now + w / c.WALK_SPEED_M_PER_MIN <= depart]
    return min(ok, key=lambda s: (walk_m(s, pickup), s["id"]), default=None)


def solo_fare(me) -> float:
    """What this rider would pay alone, door to campus, for the same arrive-by."""
    return fare.up05(fare.trip(me["lat"], me["lon"], me["campus"], me["desired_arrival"])["fare"])


def ride_id(day, group, depart, campus) -> str:
    return hashlib.sha256(repr((day, [(r["id"], depart, campus) for r in group])).encode()).hexdigest()[:12]
