# CLAUDE.md — RideSync (Jeeny Hackathon, Path 02)

This file gives Claude Code the context for this repo. Read it before doing anything.

## What we're building

> **Scope change (25 Nov 2026, user's decision):** the app books rides only. A university is just a destination. No lateness, lecture, bus map, bus forecast or bus-report screens; the time field is "Arrive by". This overrides the bus parts below (must-haves 1 and 2, AI feature 1, demo steps 1 and 2). The bus API, model and tests stay in the backend, unused by the app. Don't bring them back without asking.

> **Merge with NextStop (26 Nov 2026, user's decision):** RideSync is the codebase; ideas from the team's NextStop spec (SPEC v5, `~/NextStop`) were ported in.
> Pricing is the LTRC smart-app tariff (`app/fare.py`, port of NextStop's `fare_model.py`): one fare split by the riders, never per-seat. Matching is always same-gender (no women-only toggle).
> Added: ride states, Find driver + ready check, simulated driver offer/accept, group chat with phone/link masking, late-leave rule (the leaver pays their share as a credit on the ride), trip summary.
> Removed: student verification (signup is name + gender, plus demo logins), family link, bring-a-friend, Arabic, "AI" framing for matching. This overrides the prices, must-haves 4–6, nice-to-haves, AI feature 2 naming, demo mechanics and demo script below. Don't bring removed features back without asking.

**RideSync** is a mobile web app for university students in Irbid, Jordan. It does two things:

1. **Shows when the bus will really arrive.** AI predicts each bus's arrival time and how crowded it will be.
2. **If the bus is late or full, students "sync" a ride.** The app matches up to 4 students going the same way at the same time into one shared Jeeny ride, and they split the fare.

- **Team:** 1337 (5 people: Computer Engineering, AI and Computer Science students from JUST, Yarmouk and Al al-Bayt)
- **Event:** Jeeny Next Stop, Mobility x AI Hackathon (Jeeny x AAU), Path 02 "Student commute & daily trips". Jeeny is a ride-hailing app in Saudi Arabia and Jordan.
- **Dates:** Fri 27 and Sat 28 November 2026 at Ahliyya Amman University. **Demo submission closes Fri 11:59 PM.** Semi-finals Sat 10:00, nine-team final 13:45. Technology partner: Replit.
- **Not confirmed:** Jeeny coverage in Irbid, whether fare splitting is allowed (LTRC), submission format. Never claim them. Nothing connects to a real Jeeny system.
- **Pilot area:** Irbid city → **JUST** (Jordan University of Science and Technology) and **Yarmouk University**
- **Build day goal:** a working demo that judges can open on their own phones

## The problem (keep the product focused on this)

- **Unreliable buses.** There are no fixed times, buses wait until they're full, and they're overcrowded. Students miss lectures.
- **The bus isn't really cheap.** The fare is **0.60 JD**, but many students pay a **~1.5 JD taxi** just to reach the bus station, and some need several buses.
- **Taxis are too expensive daily.** A solo taxi from Irbid city to JUST costs **4–5 JD**.
- **Safety.** Crowded buses and rides with strangers are a concern, especially for female students and their families.

**Persona:** Ahmad, 20, Computer Engineering at JUST, lives in Irbid city, no car, tight budget. He takes a 1.5 JD taxi to the station, waits for the bus to fill, changes buses, and arrives late.

## Prices (tariff, since the 26 Nov merge)

All constants live in `app/config.py` (`TARIFF_DAY`, `TARIFF_NIGHT`, `MIN_FARE_JD`, `CALIBRATION`, traffic curve).

```
full fare   = max(1.00, CALIBRATION x (flag + km x per_km + wait_min x per_min))   # LTRC smart-app tariff
share       = ceil_to_0.05((full fare - credits) / riders)
demo        = Al-Andalus -> JUST, arrive by 8:00: fare 6.87, 4 riders pay 1.75 each, alone 6.90
```

- The rider sees their share, the full fare and the solo price before joining. After joining: savings vs. riding alone only.
- Shared rides are **JUST-only** for now.
- No monthly pass. The business model is **pay per ride**. Each shared ride is one normal Jeeny trip with the usual commission.

## MVP scope for build day

### Must have
1. **Live bus map** (Leaflet) showing buses on Irbid → JUST/Yarmouk routes, each with a predicted arrival time and crowding level (seats free / almost full / full)
2. **"You'll be late" check.** The student enters their lecture time, and the app compares it with the predicted bus arrival.
3. **Sync a ride.** The app finds students near the user with the same destination and time window, then shows the pickup point, departure time, arrival time and price per seat. The user can join.
4. **Women-only rides** toggle. Female riders are only matched with female riders.
5. **Ride price:** shown on the Sync button, the ride and the joined ride. No comparison chart; after joining, the ride shows savings against taxi + bus and a solo taxi
6. **Student verification** (mock: a university email domain check)

### Nice to have (only if Must-haves are done)
- Built: ride with a friend ("Bring a friend" holds a seat, the link works once, the friend must be verified, women-only is checked on the server), family trip link, Arabic UI toggle, arrival range and late risk, "I'm on this bus" report for the student's own bus, drop-out handling, tomorrow plan
- Not built: driver view (today's pods and stops)

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
- **Design:** looks like the Jeeny app (home, menu, pickup map, account) with Sync as a new tile. Pink `#EE018D`, purple `#5B2384`. `static/shell.js` is the app around Sync, `static/app.js` is Sync. Prices show as `JOD 1.75`. Font: Poppins (vendored), Inter as fallback. Keep the "student concept, not the official Jeeny app" note, and never put real people's details from screenshots in the repo. Bump `?v=` in `static/index.html` when JS or CSS changes
- **Run:** `./run.sh` or `docker compose up --build`. **Test:** `.venv/bin/python -m pytest`
- See `README.md` for the file map. `app/config.py` is the one config file.

## Demo mechanics

- Each visitor's clock starts at `DEMO_NOW` (06:10), runs at 6x and **holds at 06:15** until a driver accepts (joining closes 45 min before pickup, so a 07:15 car must be joined by 06:30). "Demo: skip to" jumps into the late-leave window; "Play the trip" runs fast to 08:00. ↺, reload or switching account restarts it. The bus model keeps its own snapshot time `BUS_NOW` (07:05). Settings are in `app/config.py`.
- Buses follow the model's predicted trajectory along the road. Live buses are inputs in `scripts/generate_data.py`; arrival and crowding come from the model. Don't hard-code predictions.
- Each visitor gets their own session, so one judge joining never fills another's car. Chat, drop-outs, balances and bus reports are per session too, and ↺ clears them.
- Gender is set once at signup (name + gender) and can't be changed. Demo logins: Ahmad (M) and Lina (F).
- Keep numpy and scikit-learn pinned: the 8:14 / 91% demo numbers depend on them (covered by tests).
- Say openly that the data is synthetic.

Keep everything runnable with **one command** (e.g. `docker compose up` or `npm run dev`), and include a seeded demo state.

## Demo script (3 minutes). Everything should serve this.

1. Ahmad opens Sync: Al-Andalus → JUST, arrive by 8:00. The button says about JOD 1.75 each.
2. He taps Sync: 3 men near him, pickup 07:15 at the Al-Andalus meeting point, arrive 07:48, one fare of 6.87 split by 4 (alone 6.90).
3. He joins. The group chat opens; he types a phone number and it's hidden.
4. He taps Find driver. The ready check runs; the others answer Ready; he taps I'm ready.
5. The driver's app shows the offer (fare 6.87, collect 7.00, respond by 07:00). Accept.
6. Skip to 06:50: Zaid leaves late and pays his own share; Ahmad's stays 1.75. Play the trip → summary: driver gets 5.25 cash + 1.75 credit = 7.00.
7. Lina gets matched only with women (Rania, Dana, Tala), JOD 1.70 each.

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
