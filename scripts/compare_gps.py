"""Compare a real bus trip (GPX from any phone tracker) with the simulated ones.

Run: python -m scripts.compare_gps trip.gpx R2
Prints when the bus passed each stop and how that compares with our simulated history.
GPX files hold someone's location: keep them out of git (*.gpx is ignored).
"""
import json
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import numpy as np

from app import config as c
from app import db
from app.geo import haversine_m

NEAR_M = 250
JORDAN = timezone(timedelta(hours=3))


def read_gpx(path):
    pts = []
    for p in ET.parse(path).iter():
        if p.tag.endswith("trkpt"):
            stamp = next((k.text for k in p if k.tag.endswith("time")), None)
            if stamp:
                when = datetime.fromisoformat(stamp.strip().replace("Z", "+00:00")).astimezone(JORDAN)
                pts.append((when.hour * 60 + when.minute + when.second / 60, float(p.get("lat")), float(p.get("lon"))))
    return pts


def passes(pts, stops):
    """Minute the track came closest to each stop, in route order (None if never near)."""
    out, start = [], 0
    for s in stops:
        d = [haversine_m(la, lo, s["lat"], s["lon"]) for _, la, lo in pts[start:]]
        if not d or min(d) > NEAR_M:
            out.append(None)
            continue
        start += int(np.argmin(d))
        out.append(pts[start][0])
    return out


def main(path, route_id):
    routes = {r["id"]: r for r in json.loads(c.ROUTES_PATH.read_text())}
    if route_id not in routes:
        raise SystemExit(f"Unknown route {route_id}. Use one of: {', '.join(routes)}")
    stops, pts = routes[route_id]["stops"], read_gpx(path)
    if not pts:
        raise SystemExit("No timestamped track points in this file")
    at = passes(pts, stops)
    print(f"{len(pts)} GPS points, {c.min_to_hhmm(pts[0][0])} to {c.min_to_hhmm(pts[-1][0])}, route {routes[route_id]['name']}")
    for i, (s, m) in enumerate(zip(stops, at)):
        line = f"  {s['name']:<24}{c.min_to_hhmm(m) if m is not None else 'not passed within %d m' % NEAR_M}"
        if i and m is not None and at[i - 1] is not None:
            sim = [r["y_minutes"] for r in db.all_rows(
                "SELECT y_minutes FROM bus_obs WHERE route = ? AND from_stop = ? AND to_stop = ? AND filling = 0 "
                "AND minute BETWEEN ? AND ?", (route_id, i - 1, i, at[i - 1] - 45, at[i - 1] + 45))]
            line += f"   real {m - at[i - 1]:.1f} min"
            if sim:
                line += f", simulated {np.mean(sim):.1f} (10-90%: {np.quantile(sim, .1):.1f}-{np.quantile(sim, .9):.1f})"
        print(line)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
