"""AI feature 1: bus arrival and crowding prediction."""
import json

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
        xt = _x(test)

        def mae(pred, f):
            return round(float(np.mean(np.abs(pred - targets(test, f)))), 3)

        self.metrics = {
            "data": "synthetic", "train_rows": len(train), "test_rows": len(test), "held_out_days": TEST_DAYS,
            "arrival_mae_min": {"baseline": mae(base[:, 0], "y_minutes"), "model": mae(self.time.predict(xt), "y_minutes")},
            "crowding_mae": {"baseline": mae(base[:, 1], "y_occ"), "model": mae(self.occ.predict(xt), "y_occ")},
        }
        # One forecast per live bus from its last report; visitors replay it on their own clock.
        self.buses = [self._predict_bus(b) for b in all_rows("SELECT * FROM live_buses ORDER BY id")]

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
                "arrival": out[-1]["time"], "arrival_minute": out[-1]["minute"], "level": crowd_level(peak)}

    def _nominal(self, route):
        acc = [0.0]
        for leg in route["legs"]:
            acc.append(acc[-1] + leg["minutes"] * c.BUS_SLOWDOWN)
        return acc

    def predictions(self, now, route=None):
        out = []
        for bus in self.buses:
            if route in (None, bus["route"]):
                lat, lon = position_at(bus["track"], now)
                out.append({**bus, "lat": lat, "lon": lon, "filling": now < bus["departs_minute"],
                            "arrived": now >= bus["arrival_minute"]})
        return out

    def next_bus(self, lat, lon, campus, now):
        """Soonest-arriving bus to `campus` that the student can still catch, or None."""
        best = None
        for bus in self.predictions(now):
            if bus["campus"] != campus:
                continue
            for s in bus["stops"][:-1]:
                st = self.routes[bus["route"]]["stops"][s["stop"]]
                d = haversine_m(lat, lon, st["lat"], st["lon"]) * c.ROAD_FACTOR
                walkable = d <= c.STOP_WALKABLE_M
                access = d / c.WALK_SPEED_M_PER_MIN if walkable else c.TAXI_TO_STOP_MIN
                if s["minute"] < now + access:
                    continue
                cand = {**bus, "board": s, "needs_taxi": not walkable,
                        "bus_cost": round(c.BUS_FARE_JD + (0 if walkable else c.TAXI_TO_STATION_JD), 2), "_d": d}
                if best is None or (bus["arrival_minute"], d) < (best["arrival_minute"], best["_d"]):
                    best = cand
        if best:
            best.pop("_d")
            best.pop("track")
        return best
