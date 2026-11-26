# RideSync

Books shared Jeeny rides: groups riders of the same gender going the same way at the same time into one car, and they split one fare
(LTRC smart-app tariff). Includes group chat, a ready check, a simulated driver offer, the late-leave rule and a trip summary,
merged from the team's NextStop spec (SPEC v5).

    ./run.sh              # or: docker compose up --build
    open http://localhost:8000

Tests: `.venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest` (`run.sh` installs runtime packages only)

| Path | What |
|---|---|
| `app/config.py` | Every price, rule and demo setting |
| `app/fare.py` | Tariff, traffic and trip time (port of NextStop's `fare_model.py`) |
| `app/rides.py` | Ride states, ready check, driver, leaving, chat masking, summary |
| `app/predict.py` | Bus arrival and crowding model (backend only, not shown in the app) |
| `app/matching.py` | Rules-based matching: same gender, destination, time, walk |
| `app/main.py` | FastAPI endpoints, serves `static/` |
| `scripts/generate_data.py` | Seeded synthetic students, bus history and demo scenario |
| `static/shell.js` | Jeeny-style app around Sync: home, menu, pickup, account and simple pages |
| `static/app.js` | Sync: booking, joined ride by state, group chat, driver's app, tomorrow's seat |
| `static/map.js` | Google map when `GOOGLE_MAPS_KEY` is set in `.env`, otherwise OpenStreetMap |
| `static/i18n.js` | Text and price formatting (English only) |
| `scripts/compare_gps.py` | Compare a recorded bus trip (GPX) with the simulated ones |
| `docs/` | Judge Q&A, survey |
| `render.yaml` | Public HTTPS deployment |
| `scripts/fetch_ride_paths.py` | One-off OSRM fetch that produced `data/ride_paths.json` |
| `scripts/fetch_routes.py` | One-off OSRM fetch that produced `data/routes.json` |

All riders, drivers, trips and live buses are synthetic. Station and campus coordinates are from
OpenStreetMap; which bus lines stop where is our approximation. Map data © OpenStreetMap contributors.
Fonts: Poppins (Indian Type Foundry) and Inter, both under the SIL Open Font License.

Demo flow (Ahmad or Lina): Sync → Join → chat → Find driver → I'm ready → open the driver's app → Accept →
"skip to" (late-leave window) → a rider leaves → Play the trip → summary. Resetting the demo: tap ↺ to restart the clock; restarting `./run.sh` rebuilds the database. Each visitor has their own session.
