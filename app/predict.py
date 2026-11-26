"""AI feature 1: bus arrival and crowding prediction."""
import json
from functools import lru_cache

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

from . import config as c
from .db import all_rows
from .geo import haversine_m, position_at, timed_path

FEATURES = ["route", "from_stop", "to_stop", "filling", "minute", "elapsed", "occ", "rain", "dow", "nominal"]
TEST_DAYS = 3


def _x(rows):
    return np.array([[int(r["route"][1:]) if f == "route" else r[f] for f in FEATURES] for r in rows], float)


def _model():
    return HistGradientBoostingRegressor(max_iter=200, learning_rate=0.06, min_samples_leaf=15, random_state=c.SEED)


def _quantile_model(q):
    # Larger leaves than the point model: tail quantiles need more rows behind each estimate.
    return HistGradientBoostingRegressor(loss="quantile", quantile=q, max_iter=120, learning_rate=0.06,
                                         min_samples_leaf=40, random_state=c.SEED)


def crowd_level(occ: float) -> str:
    if occ >= c.CROWD_FULL:
        return "full"
    return "almost full" if occ >= c.CROWD_ALMOST_FULL else "seats free"


class BusPredictor:
    def __init__(self):
        self.routes = {r["id"]: r for r in json.loads(c.ROUTES_PATH.read_text())}
        rows = all_rows("SELECT * FROM bus_obs")
        cut = max(r["day"] for r in rows) - TEST_DAYS + 1
        train, test = [r for r in rows if r["day"] < cut], [r for r in rows if r["day"] >= cut]

        # Baseline: historical mean for the same route, stops and bus state.
        key = lambda r: (r["route"], r["from_stop"], r["to_stop"], r["filling"])
        groups = {}
        for r in train:
            groups.setdefault(key(r), []).append((r["y_minutes"], r["y_occ"]))
        means = {k: np.mean(v, axis=0) for k, v in groups.items()}
        base = np.array([means[key(r)] for r in test])

        def targets(rs, f):
            return np.array([r[f] for r in rs])

        self.time = _model().fit(_x(train), targets(train, "y_minutes"))
        self.occ = _model().fit(_x(train), targets(train, "y_occ"))
        self.quantiles = [_quantile_model(q).fit(_x(train), targets(train, "y_minutes")) for q in c.QUANTILES]
        xt = _x(test)
        lo, hi = (m.predict(xt) for m in (self.quantiles[c.QUANTILES.index(0.10)], self.quantiles[c.QUANTILES.index(0.90)]))
        actual = targets(test, "y_minutes")

        def mae(pred, f):
            return round(float(np.mean(np.abs(pred - targets(test, f)))), 3)

        self.metrics = {
            "data": "synthetic", "train_rows": len(train), "test_rows": len(test), "held_out_days": TEST_DAYS,
            "arrival_mae_min": {"baseline": mae(base[:, 0], "y_minutes"), "model": mae(self.time.predict(xt), "y_minutes")},
            "crowding_mae": {"baseline": mae(base[:, 1], "y_occ"), "model": mae(self.occ.predict(xt), "y_occ")},
            # Share of held-out arrivals that fell inside the 10-90% range (80% would be perfect).
            "range_coverage": round(float(np.mean((actual >= lo) & (actual <= hi))), 3),
        }
        # One forecast per live bus from its last report; visitors replay it on their own clock.
        # A rider's report replaces the starting state, so the same model forecasts again from it.
        self.live = {b["id"]: b for b in all_rows("SELECT * FROM live_buses ORDER BY id")}
        self._cached = lru_cache(maxsize=512)(lambda items: self._predict_bus(dict(items)))
        self._trips = self._trip_history(rows)

    def observation(self, bus_id, reports, now):
        """Latest known state of a bus: its last GPS fix, or a newer rider report."""
        bus, newest = self.live[bus_id], None
        for r in reports:
            if r["bus"] == bus_id and r["minute"] <= now and (newest is None or r["minute"] >= newest["minute"]):
                newest = r
        if newest is None:
            return bus, None
        return {**bus, "from_stop": newest["from_stop"], "filling": newest["filling"], "minute": newest["minute"],
                "elapsed": bus["elapsed"] + newest["minute"] - bus["minute"], "occ": newest["occ"]}, newest["minute"]

    def forecast(self, seen):
        return self._cached(tuple(seen.items()))

    def late_risk(self, bus, lecture):
        """Chance the bus reaches campus after the lecture starts, kept within the modelled quantiles."""
        on_time = float(np.interp(lecture, bus["arrival_q"], c.QUANTILES))
        return round(1 - on_time, 2)

    def _predict_bus(self, bus):
        route = self.routes[bus["route"]]
        # Same nominal times as the training rows.
        nominal_by_stop = self._nominal(route)
        stops = range(bus["from_stop"] if bus["filling"] else bus["from_stop"] + 1, len(route["stops"]))
        rows = [{**bus, "to_stop": s, "nominal": nominal_by_stop[s] - nominal_by_stop[bus["from_stop"]]} for s in stops]
        x = _x(rows)
        mins, occs = self.time.predict(x), np.clip(self.occ.predict(x), 0, 1)
        out, last = [], bus["minute"]
        for s, m, o in zip(stops, mins, occs):
            last = max(last, bus["minute"] + float(m))  # arrivals never go backwards
            out.append({"stop": s, "name": route["stops"][s]["name"], "minute": last, "time": c.min_to_hhmm(last),
                        "occupancy_pct": round(float(o) * 100), "level": crowd_level(float(o))})
        # Sorted so quantiles never cross; the range always contains the point forecast.
        q = np.sort([float(m.predict(x[-1:])[0]) for m in self.quantiles]) + bus["minute"]
        low = min(q[c.QUANTILES.index(0.10)], last)
        high = max(q[c.QUANTILES.index(0.90)], last)
        # Where the model expects the bus to be at each minute, along the real road.
        track, frm, at = [], bus["from_stop"], bus["minute"]
        if bus["filling"]:
            first = route["stops"][0]
            track = [[at, first["lat"], first["lon"]]]
            at = out[0]["minute"]  # predicted departure
        for s in out:
            if s["stop"] > frm:
                track += timed_path(route["legs"][s["stop"] - 1]["path"], at, s["minute"])
                at = s["minute"]
        # The terminus row is occupancy on arrival; the busiest stretch is what riders feel.
        peak = max([bus["occ"]] + [p["occupancy_pct"] / 100 for p in out])
        return {"id": bus["id"], "route": route["id"], "route_name": route["name"], "campus": route["campus"],
                "track": track, "departs_minute": out[0]["minute"] if bus["filling"] else bus["minute"], "stops": out,
                "current_occupancy_pct": round(bus["occ"] * 100), "peak_occupancy_pct": round(peak * 100),
                "arrival": out[-1]["time"], "arrival_minute": out[-1]["minute"],
                "arrival_q": [float(v) for v in q], "arrival_low": c.min_to_hhmm(low), "arrival_high": c.min_to_hhmm(high),
                "last_stop": bus["from_stop"], "can_wait": bool(bus["filling"]), "level": crowd_level(peak)}

    def _nominal(self, route):
        acc = [0.0]
        for leg in route["legs"]:
            acc.append(acc[-1] + leg["minutes"] * c.BUS_SLOWDOWN)
        return acc

    def predictions(self, now, route=None, reports=()):
        out = []
        for bus_id, live in self.live.items():
            if route in (None, live["route"]):
                seen, reported = self.observation(bus_id, reports, now)
                bus = {**self.forecast(seen), "reported": reported and c.min_to_hhmm(reported)}
                lat, lon = position_at(bus["track"], now)
                out.append({**bus, "lat": lat, "lon": lon, "filling": now < bus["departs_minute"],
                            "arrived": now >= bus["arrival_minute"]})
        return out

    def access(self, lat, lon, stop):
        """(road metres, minutes, needs_taxi) from home to a stop."""
        d = haversine_m(lat, lon, stop["lat"], stop["lon"]) * c.ROAD_FACTOR
        walkable = d <= c.STOP_WALKABLE_M
        return d, d / c.WALK_SPEED_M_PER_MIN if walkable else c.TAXI_TO_STOP_MIN, not walkable

    def _trip_history(self, rows):
        """{(route, stop): {day: [(leaves stop, reaches campus)]}} for buses that still had room."""
        out = {}
        for r in rows:
            if not r["filling"] and r["to_stop"] == len(self.routes[r["route"]]["stops"]) - 1 and r["occ"] < c.CROWD_FULL:
                out.setdefault((r["route"], r["from_stop"]), {}).setdefault(r["day"], []).append(
                    (r["minute"], r["minute"] + r["y_minutes"]))
        return out

    def plan(self, lat, lon, campus, lecture):
        """Latest time to be at a stop so the bus was on time on enough past days, or None."""
        best = None
        for rid, route in self.routes.items():
            if route["campus"] != campus:
                continue
            # Nearest stop only: the fixed taxi fare and time don't cover a ride to a distant one.
            i = min(range(len(route["stops"]) - 1), key=lambda k: self.access(lat, lon, route["stops"][k])[0])
            days = self._trips.get((rid, i), {})
            if not days:
                continue
            _, minutes, taxi = self.access(lat, lon, route["stops"][i])
            for t in range(lecture - c.PLAN_STEP_MIN, lecture - c.PLAN_LOOKBACK_MIN, -c.PLAN_STEP_MIN):
                ok = sum(min((a for leave, a in trips if leave >= t), default=1e9) <= lecture for trips in days.values())
                if ok < c.PLAN_RELIABILITY * len(days):
                    continue
                home = t - minutes
                if best is None or home > best["_home"]:
                    best = {"_home": home, "stop": route["stops"][i]["name"], "at_stop": c.min_to_hhmm(t),
                            "leave_home": c.min_to_hhmm(home), "needs_taxi": taxi, "ok_days": ok, "days": len(days),
                            "cost": round(c.BUS_FARE_JD + (c.TAXI_TO_STATION_JD if taxi else 0), 2)}
                break
        if best:
            best.pop("_home")
        return best

    def next_bus(self, lat, lon, campus, now, reports=()):
        """Soonest-arriving bus to `campus` that the student can still catch, or None."""
        best = None
        for bus in self.predictions(now, reports=reports):
            if bus["campus"] != campus:
                continue
            for s in bus["stops"][:-1]:
                st = self.routes[bus["route"]]["stops"][s["stop"]]
                d, access, taxi = self.access(lat, lon, st)
                if s["minute"] < now + access:
                    continue
                cand = {**bus, "board": s, "needs_taxi": taxi,
                        "bus_cost": round(c.BUS_FARE_JD + (c.TAXI_TO_STATION_JD if taxi else 0), 2), "_d": d}
                if best is None or (bus["arrival_minute"], d) < (best["arrival_minute"], best["_d"]):
                    best = cand
        if best:
            best.pop("_d")
            best.pop("track")
        return best
