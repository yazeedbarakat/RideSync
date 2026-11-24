"""Impact numbers for the pitch, on the synthetic JUST students. Run: python -m scripts.impact

Everything here is simulated: it shows how the matching rules behave, not real demand.
"""
from itertools import combinations

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp  # installed with scikit-learn
from scipy.sparse import csc_matrix

from app import config as c
from app import db, matching

NOW = c.hhmm_to_min(c.DEMO_NOW)
NEIGHBOURS = 12  # same search width the live matcher uses


def one_at_a_time(pool):
    """Cars formed in sign-up order; each student sits in at most one car."""
    left, cars = {s["id"]: s for s in pool}, []
    for s in pool:
        if s["id"] in left:
            m = matching.best_group(s, [x for x in left.values() if x is not s], NOW)
            if m:
                cars.append(m["group"])
                for r in m["group"]:
                    del left[r["id"]]
    return cars


def all_groups(pool):
    """Every valid car among each student's nearest compatible students."""
    out = {}
    for s in pool:
        near = sorted((x for x in pool if x is not s and matching.group_ok([s, x]) and matching.walk_m(s, x) <= 2 * c.MAX_WALK_M),
                      key=lambda x: (matching.walk_m(s, x), x["id"]))[:NEIGHBOURS]
        for size in (c.MAX_RIDERS_PER_CAR, c.MIN_RIDERS_PER_CAR):
            for others in combinations(near, size - 1):
                key = tuple(sorted(r["id"] for r in (s, *others)))
                if key in out or not matching.group_ok([s, *others]):
                    continue
                m = matching.best_group(s, others, NOW)
                if m and len(m["group"]) == size:
                    out[key] = m["group"]
    return out


def all_together(pool):
    """Plan every car at once: seat the most students, then use the fewest cars."""
    groups = all_groups(pool)
    keys, row = list(groups), {s["id"]: i for i, s in enumerate(pool)}
    a = csc_matrix((np.ones(sum(map(len, keys))), ([row[i] for k in keys for i in k], [j for j, k in enumerate(keys) for _ in k])),
                   shape=(len(pool), len(keys)))
    res = milp(-np.array([len(k) - 0.1 for k in keys]), constraints=LinearConstraint(a, ub=1), bounds=Bounds(0, 1),
               integrality=np.ones(len(keys)), options={"time_limit": 120})
    if res.x is None:
        raise SystemExit(f"Planner failed: {res.message}")
    print(f"  (planner: {len(keys)} possible cars, {'proven optimal' if res.status == 0 else res.message})")
    return [groups[k] for k, v in zip(keys, res.x) if v > 0.5]


def describe(name, cars, pool):
    seated = sum(map(len, cars))
    four = sum(len(g) == c.MAX_RIDERS_PER_CAR for g in cars)
    paid = sum(c.SOLO_TAXI_TO_JUST_JD for _ in cars)
    taxi_bus = c.BUS_FARE_JD + c.TAXI_TO_STATION_JD
    print(f"{name}: {seated}/{len(pool)} students seated ({seated / len(pool):.0%}) in {len(cars)} cars, {four} of them full")
    print(f"  average seat {paid / seated:.2f} JD, {1 - paid / seated / taxi_bus:.0%} below taxi + bus ({taxi_bus:.2f});"
          f" {len(cars)} trips at a full fare for Jeeny drivers; {seated - len(cars)} fewer cars than solo taxis")


def rate(name, students, pool, **change):
    exact = any_ = 0
    for s in students:
        m, earlier = matching.find({**s, **change}, [x for x in pool if x["id"] != s["id"]], NOW)
        any_ += bool(m)
        exact += bool(m) and earlier == 0
    n = len(students)
    print(f"{name}: {exact}/{n} match at their time ({exact / n:.0%}); {any_}/{n} ({any_ / n:.0%}) "
          f"counting cars up to {c.MAX_EARLIER_MIN} min earlier")


if __name__ == "__main__":
    pool = db.all_rows("SELECT * FROM students WHERE campus = 'JUST' ORDER BY id")
    women = [s for s in pool if s["gender"] == "F"]
    print(f"SIMULATED: {len(pool)} synthetic JUST students, seed {c.SEED}, searching at {c.DEMO_NOW}\n")
    rate("Anyone, searching alone", pool, pool)
    rate("Women, women-only off", women, pool, women_only=0)
    rate("Women, women-only on", women, pool, women_only=1)
    print()
    describe("Cars formed one at a time", one_at_a_time(pool), pool)
    describe("All cars planned together", all_together(pool), pool)
