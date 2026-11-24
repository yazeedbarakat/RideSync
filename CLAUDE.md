# CLAUDE.md — RideSync (Jeeny Hackathon, Path 02)

This file gives Claude Code the context for this repo. Read it before doing anything.

## What we're building

**RideSync** is a mobile web app for university students in Irbid, Jordan. It does two things:

1. **Shows when the bus will really arrive.** AI predicts each bus's arrival time and how crowded it will be.
2. **If the bus is late or full, students "sync" a ride.** The app matches up to 4 students going the same way at the same time into one shared Jeeny ride, and they split the fare.

- **Team:** 1337 (5 people: Computer Engineering, AI and Computer Science students from JUST, Yarmouk and Al al-Bayt)
- **Event:** Jeeny Hackathon, Path 02 "Student commute & daily trips". Jeeny is a ride-hailing app in Jordan.
- **Pilot area:** Irbid city → **JUST** (Jordan University of Science and Technology) and **Yarmouk University**
- **Build day goal:** a working demo that judges can open on their own phones

## The problem (keep the product focused on this)

- **Unreliable buses.** There are no fixed times, buses wait until they're full, and they're overcrowded. Students miss lectures.
- **The bus isn't really cheap.** The fare is **0.60 JD**, but many students pay a **~1.5 JD taxi** just to reach the bus station, and some need several buses.
- **Taxis are too expensive daily.** A solo taxi from Irbid city to JUST costs **4–5 JD**.
- **Safety.** Crowded buses and rides with strangers are a concern, especially for female students and their families.

**Persona:** Ahmad, 20, Computer Engineering at JUST, lives in Irbid city, no car, tight budget. He takes a 1.5 JD taxi to the station, waits for the bus to fill, changes buses, and arrives late.

## Prices (use these exact constants)

```
BUS_FARE_JD            = 0.60
TAXI_TO_STATION_JD     = 1.50
SOLO_TAXI_TO_JUST_JD   = 4.00 – 5.00   (use 5.00 as default, so 4 riders pay 1.25)
MAX_RIDERS_PER_CAR     = 4
MIN_RIDERS_PER_CAR     = 3             (2 riders would pay 2.50, more than taxi + bus)
SHARED_SEAT_JD         = solo fare / riders   (1.25 JD with 4 riders, 1.67 with 3)
```

- The rider sees the worst-case price (3 riders) before joining.
- Shared rides are **JUST-only** for now: there is no agreed Yarmouk fare. Yarmouk buses are still shown.
- No monthly pass. The business model is **pay per ride**.
- Each shared ride is a normal Jeeny trip, so Jeeny takes its usual commission and the driver still gets one full fare.

## MVP scope for build day

### Must have
1. **Live bus map** (Leaflet) showing buses on Irbid → JUST/Yarmouk routes, each with a predicted arrival time and crowding level (seats free / almost full / full)
2. **"You'll be late" check.** The student enters their lecture time, and the app compares it with the predicted bus arrival.
3. **Sync a ride.** The app finds students near the user with the same destination and time window, then shows the pickup point, departure time, arrival time and price per seat. The user can join.
4. **Women-only rides** toggle. Female riders are only matched with female riders.
5. **Price comparison card:** bus (0.60), taxi to station + bus (~2.10), RideSync (~1.25), solo taxi (4–5)
6. **Student verification** (mock: a university email domain check)

### Nice to have (only if Must-haves are done)
- Live trip sharing link for family
- Driver view: today's pods and stops
- Arabic UI toggle

### Out of scope
Real payments, real Jeeny API or dispatch integration, native apps, Saudi Arabia, monthly passes.

## The two AI features

### 1. Bus arrival and crowding prediction
- **Real-world idea:** GPS shared by students riding the bus (crowdsourced), plus time of day, lecture start times, past trips and weather
- **Build day:** we have no real bus GPS, so **generate synthetic bus trips** (timestamps along a route polyline, with delays that grow at morning rush times and around 8:00 lectures)
- **Model:** start with a simple baseline (historical average travel time + current delay). Upgrade to a gradient-boosted regressor if time allows. Crowding is a classifier or rule based on time slot and stop.
- Expose it as `GET /api/buses/predictions?route=...`

### 2. Smart ride matching
- **Inputs per request:** pickup location, destination campus, desired arrival time, women-only flag
- **Constraints:** same destination; pickup within ~500 m walking of a shared pickup point; arrival window ±10 min (target = 10 min before the lecture); 3–4 riders per car; women-only respected
- **Approach:** cluster requests by location and time, then pick a pickup point that keeps detours short (greedy first; OR-Tools only if there's time)
- **Trigger:** suggest matching when the predicted bus arrival is after the lecture time, or the bus is predicted full
- Expose it as `POST /api/rides/match` and `POST /api/rides/:id/join`

## Data

- Use **synthetic data**: ~300–500 students (Irbid neighborhoods, destination, lecture times, gender), several bus routes and a few days of bus trips
- Keep generators in `data/` or `scripts/` and make them deterministic (seeded) so the demo is the same every run
- Campus coordinates are approximate. **Verify on a map before the demo.**
  - JUST = 32.4934, 35.9899 (OpenStreetMap)

## Stack (decided)

- One **FastAPI** app: API, ML (scikit-learn), matching, SQLite, and it serves the frontend
- **Frontend:** mobile-first plain JS with Leaflet (vendored), no build step
- **Design:** Jeeny colors, pink `#E5007D` and purple `#5B2384`, with the Inter font
- **Run:** `./run.sh` or `docker compose up --build`. **Test:** `.venv/bin/python -m pytest`
- See `README.md` for the file map. `app/config.py` is the one config file.

## Demo mechanics

- Each visitor's clock starts at `DEMO_NOW` (07:05), runs at 6x, and **holds at 07:14** until they join, because Ahmad's bus can't be caught after 07:16. After joining it runs fast to 08:20. ↺, reload or switching student restarts it. Settings are in `app/config.py`.
- Buses follow the model's predicted trajectory along the road. Live buses are inputs in `scripts/generate_data.py`; arrival and crowding come from the model. Don't hard-code predictions.
- Each visitor gets their own session, so one judge joining never fills another's car.
- Gender comes from the mock registry, never from the client. Demo students: `ahmad@cit.just.edu.jo`, `lina@cit.just.edu.jo`.
- Keep numpy and scikit-learn pinned: the 8:14 / 91% demo numbers depend on them (covered by tests).
- Say openly that the data is synthetic.

Keep everything runnable with **one command** (e.g. `docker compose up` or `npm run dev`), and include a seeded demo state.

## Demo script (3 minutes). Everything should serve this.

1. Ahmad opens RideSync and sees his 8:00 lecture at JUST.
2. The map shows the next bus: predicted arrival 8:14 and 91% full, with a "You'll be late" warning.
3. He taps "Sync a ride" and sees 3 students near him, leaving 7:20, arriving 7:48, at 1.25 JD each.
4. He joins, and the price comparison shows his savings against the taxi-plus-bus combo and a solo taxi.
5. A female student turns on women-only and gets matched only with women.

## How judges score (prioritize accordingly)

| Criterion | Weight |
|---|---|
| Product strategy & user persona | 30% |
| Execution with AI assistance | 30% |
| Integration of AI features | 20% |
| Market entry & pitch | 20% |

"Execution with AI assistance" counts for a lot, so keep a short `AI_LOG.md` noting how AI tools helped (generating data, scaffolding, tests, debugging).

## Working rules for Claude Code

- **The demo comes first.** Get each Must-have working end to end before polishing anything.
- Make small, focused changes and explain *why* in a sentence or two before big structural decisions.
- Don't add dependencies or features outside the MVP without asking.
- Keep the constants above in one config file. Never hard-code prices in UI components.
- Never commit secrets or API keys. Use `.env` with a committed `.env.example`.
- When unsure about a product decision, ask rather than guess.
