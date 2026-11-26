"""One-off: fetch each neighbourhood's road path to JUST from OSRM into data/ride_paths.json.

Used to draw the shared car on the map. The output is committed, so the demo never needs this.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import CAMPUSES, HOODS, RIDE_PATHS_PATH, SYNC_CAMPUSES

out = {}
for campus in sorted(SYNC_CAMPUSES):
    end = CAMPUSES[campus]
    for hood, (_, lat, lon) in HOODS.items():
        url = (f"https://router.project-osrm.org/route/v1/driving/{lon},{lat};{end['lon']},{end['lat']}"
               "?overview=simplified&geometries=geojson")
        req = urllib.request.Request(url, headers={"User-Agent": "generic-demo-geocoder/1.0"})
        r = json.load(urllib.request.urlopen(req, timeout=30))["routes"][0]
        out.setdefault(campus, {})[hood] = [[round(y, 5), round(x, 5)] for x, y in r["geometry"]["coordinates"]]
        print(campus, hood, round(r["distance"] / 1000, 1), "km", len(out[campus][hood]), "points")
        time.sleep(1)
RIDE_PATHS_PATH.write_text(json.dumps(out))
