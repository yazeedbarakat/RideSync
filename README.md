# RideSync

Predicts when the bus to JUST will really arrive, and groups students into a shared ride when it's late.

    ./run.sh              # or: docker compose up --build
    open http://localhost:8000

Tests: `.venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest` (`run.sh` installs runtime packages only)

| Path | What |
|---|---|
| `app/config.py` | Every price, rule and demo setting |
| `app/predict.py` | AI 1: arrival and crowding (gradient boosting vs. historical-average baseline) |
| `app/matching.py` | AI 2: ride matching |
| `app/main.py` | FastAPI endpoints, serves `static/` |
| `scripts/generate_data.py` | Seeded synthetic students, bus history and demo scenario |
| `static/shell.js` | Jeeny-style app around Sync: home, menu, pickup, account and simple pages |
| `static/app.js` | Sync: bus forecast, matching, joined ride, tomorrow plan |
| `static/trip.html`, `trip.js` | Family page for a shared trip |
| `static/i18n.js` | Arabic texts |
| `scripts/compare_gps.py` | Compare a recorded bus trip (GPX) with the simulated ones |
| `docs/` | Judge Q&A, survey |
| `render.yaml` | Public HTTPS deployment |
| `scripts/fetch_ride_paths.py` | One-off OSRM fetch that produced `data/ride_paths.json` |
| `scripts/fetch_routes.py` | One-off OSRM fetch that produced `data/routes.json` |

All students, trips and live buses are synthetic. Station and campus coordinates are from
OpenStreetMap; which bus lines stop where is our approximation. Map data © OpenStreetMap contributors.
Fonts: Poppins (Indian Type Foundry) and Inter, both under the SIL Open Font License.

Resetting the demo: tap ↺ to restart the clock; restarting `./run.sh` rebuilds the database. Each visitor has their own session.
