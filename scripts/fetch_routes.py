"""One-off: fetch road geometry from the public OSRM server into data/routes.json.

The output is committed, so the demo never needs this. Station and campus
coordinates are from OpenStreetMap; which lines stop where is our approximation.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import CAMPUSES, ROUTES_PATH

AMMAN = ("Amman Station", 32.5351, 35.8696)
NORTH = ("North Station", 32.5676, 35.8554)
KHALEEL = ("Sheikh Khaleel Station", 32.5496, 35.8556)
campus = lambda k: (CAMPUSES[k]["name"], CAMPUSES[k]["lat"], CAMPUSES[k]["lon"])

ROUTES = [
    ("R1", "Amman Station → JUST", "JUST",
     [AMMAN, ("Hawwara", 32.5346, 35.8926), ("Sarih", 32.5043, 35.8959), campus("JUST")]),
    ("R2", "Sheikh Khaleel → JUST", "JUST",
     [KHALEEL, ("Al-Hikma", 32.5431, 35.8632), AMMAN, ("Hawwara", 32.5346, 35.8926), campus("JUST")]),
    ("R3", "North Station → Yarmouk", "YU",
     [NORTH, ("Al-Midan", 32.5585, 35.8559), KHALEEL, campus("YU")]),
]

out = []
for rid, name, camp, stops in ROUTES:
    legs = []
    for a, b in zip(stops, stops[1:]):
        url = (f"https://router.project-osrm.org/route/v1/driving/{a[2]},{a[1]};{b[2]},{b[1]}"
               "?overview=full&geometries=geojson")
        req = urllib.request.Request(url, headers={"User-Agent": "generic-demo-geocoder/1.0"})
        r = json.load(urllib.request.urlopen(req, timeout=30))["routes"][0]
        legs.append({"km": round(r["distance"] / 1000, 2), "minutes": round(r["duration"] / 60, 1),
                     "path": [[round(y, 5), round(x, 5)] for x, y in r["geometry"]["coordinates"]]})
        time.sleep(1)
    out.append({"id": rid, "name": name, "campus": camp,
                "stops": [{"name": n, "lat": la, "lon": lo} for n, la, lo in stops], "legs": legs})
    print(rid, [(l["km"], l["minutes"]) for l in legs])
ROUTES_PATH.write_text(json.dumps(out, ensure_ascii=False))
