import json
import re
import secrets
import time
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config as c
from . import db, matching
from .geo import timed_path
from .predict import BusPredictor

TIME = r"^([01]\d|2[0-3]):[0-5]\d$"
Now = Annotated[str | None, Query(pattern=TIME)]  # visitor's simulated clock
state = {}


@asynccontextmanager
async def lifespan(_):
    if not c.DB_PATH.exists():
        from scripts.generate_data import build
        build()
    state["predictor"] = BusPredictor()
    state["ride_paths"] = json.loads(c.RIDE_PATHS_PATH.read_text())
    yield


app = FastAPI(title="RideSync", lifespan=lifespan)


def session(x_session: str = Header(default="")) -> dict:
    row = db.one("SELECT * FROM sessions WHERE id = ?", (x_session,))
    if not row:
        raise HTTPException(401, "Please verify your student email first")
    return {"id": row["id"], **json.loads(row["profile"])}


def my_reports(x_session: str = Header(default="")) -> list:
    """This visitor's own bus reports. Per visitor, so one judge can't change another's demo."""
    return db.all_rows("SELECT * FROM reports WHERE session = ?", (x_session,)) if x_session else []


def check_hood(hood: str):
    if hood not in c.HOODS:
        raise HTTPException(422, "Unknown pickup area")
    return c.HOODS[hood]


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/api/config")
def get_config():
    return {
        "now": c.DEMO_NOW,
        "clock": {"start": c.hhmm_to_min(c.DEMO_NOW), "hold_after": c.DEMO_HOLD_AFTER_MIN, "run": c.DEMO_RUN_MIN,
                  "speed": c.CLOCK_MIN_PER_SEC, "speed_joined": c.CLOCK_MIN_PER_SEC_JOINED},
        "dow": c.DEMO_DOW, "risk_bounds": [c.QUANTILES[0], c.QUANTILES[-1]], "default_lecture": c.DEFAULT_LECTURE, "campuses": c.CAMPUSES,
        "sync_campuses": sorted(c.SYNC_CAMPUSES), "min_riders": c.MIN_RIDERS_PER_CAR,
        "max_riders": c.MAX_RIDERS_PER_CAR, "prices": c.price_comparison(),
        "hoods": [{"id": k, "name": v[0], "lat": v[1], "lon": v[2]} for k, v in c.HOODS.items()],
        "routes": list(state["predictor"].routes.values()),
    }


class Verify(BaseModel):
    email: str = Field(max_length=120)


@app.post("/api/verify")
def verify(body: Verify):
    """Mock verification: checks the domain, sends no email and stores no address."""
    email = body.email.strip().lower()
    m = re.fullmatch(r"[a-z0-9._%+-]+@([a-z0-9.-]+)", email)
    uni = m and next((n for d, n in c.UNIVERSITY_DOMAINS.items() if m[1] == d or m[1].endswith("." + d)), None)
    if not uni:
        raise HTTPException(422, "Use your university email (JUST, Yarmouk or Al al-Bayt)")
    reg = db.one("SELECT * FROM registry WHERE email = ?", (email,)) or {}
    profile = {"first_name": reg.get("first_name", "Student"), "gender": reg.get("gender"),
               "hood": reg.get("hood", "andalus"), "lecture": reg.get("lecture", c.DEFAULT_LECTURE), "university": uni}
    sid = secrets.token_urlsafe(24)
    db.execute("INSERT INTO sessions VALUES (?, ?)", (sid, json.dumps(profile)))
    return {"session": sid, "profile": profile}


@app.get("/api/buses/predictions")
def bus_predictions(route: str | None = None, now: Now = None, reports: list = Depends(my_reports)):
    if route is not None and route not in state["predictor"].routes:
        raise HTTPException(404, "Unknown route")
    t = c.sim_now(now)
    return {"now": c.min_to_hhmm(t), "buses": state["predictor"].predictions(t, route, reports)}


class Report(BaseModel):
    stop: int = Field(ge=0, le=20)
    waiting: bool = False
    level: Literal["seats free", "almost full", "full"]
    now: str | None = Field(default=None, pattern=TIME)


@app.post("/api/buses/{bus_id}/report")
def report(bus_id: str, body: Report, s: dict = Depends(session), reports: list = Depends(my_reports)):
    """A rider says where the bus is and how full it is; the model forecasts again from there."""
    p = state["predictor"]
    if bus_id not in p.live:
        raise HTTPException(404, "Unknown bus")
    t = c.sim_now(body.now)
    seen, _ = p.observation(bus_id, reports, t)
    if t >= p.forecast(seen)["arrival_minute"]:
        raise HTTPException(409, "This bus has already arrived")
    last = len(p.routes[seen["route"]]["stops"]) - 1
    if not seen["from_stop"] <= body.stop < last or (body.waiting and not (seen["filling"] and body.stop == 0)):
        raise HTTPException(422, "That doesn't match where the bus was last seen")
    db.execute("INSERT OR REPLACE INTO reports VALUES (?, ?, ?, ?, ?, ?)",
               (s["id"], bus_id, t, body.stop, int(body.waiting), c.REPORT_OCC[body.level]))
    before = p.forecast(seen)
    after = p.forecast(p.observation(bus_id, my_reports(s["id"]), t)[0])
    return {"before": before["arrival"], "after": after["arrival"]}


@app.get("/api/model")
def model_metrics():
    return state["predictor"].metrics


@app.get("/api/late-check")
def late_check(hood: str, lecture: str, campus: Literal["JUST", "YU"] = "JUST", now: Now = None,
               reports: list = Depends(my_reports)):
    if not re.fullmatch(TIME, lecture):
        raise HTTPException(422, "Lecture time must be HH:MM")
    _, lat, lon = check_hood(hood)
    t = c.sim_now(now)
    bus = state["predictor"].next_bus(lat, lon, campus, t, reports)
    lec = c.hhmm_to_min(lecture)
    late = max(0, round(bus["arrival_minute"]) - lec) if bus else None
    full = bool(bus and bus["board"]["level"] == "full")
    risk = state["predictor"].late_risk(bus, lec) if bus else None
    risky = risk is not None and risk >= c.LATE_RISK
    return {"lecture": lecture, "bus": bus, "late_min": late, "late_risk": risk, "risky": risky, "full": full,
            "past": lec <= t, "suggest_sync": campus in c.SYNC_CAMPUSES and (bus is None or bool(late) or full or risky)}


class Trip(BaseModel):
    hood: str
    lecture: str = Field(pattern=TIME)
    campus: Literal["JUST", "YU"] = "JUST"
    women_only: bool = False


class Match(Trip):
    now: str | None = Field(default=None, pattern=TIME)


class Clock(BaseModel):
    now: str | None = Field(default=None, pattern=TIME)


def candidates(s: dict, campus: str) -> list:
    """Students who could ride with this visitor (minus anyone who dropped out on them)."""
    return db.all_rows("SELECT * FROM students WHERE campus = ? AND id NOT IN "
                       "(SELECT student FROM dropped WHERE session = ?)", (campus, s["id"]))


def find_ride(body: Trip, s: dict, now: int, day: str) -> dict:
    if body.campus not in c.SYNC_CAMPUSES:
        raise HTTPException(422, "Shared rides are JUST-only in this pilot")
    if body.women_only and s["gender"] != "F":
        raise HTTPException(403, "Women-only rides need a verified female student profile")
    _, lat, lon = check_hood(body.hood)
    me = {"id": 0, "first_name": s["first_name"], "gender": s["gender"], "hood": body.hood, "lat": lat, "lon": lon,
          "campus": body.campus, "desired_arrival": c.hhmm_to_min(body.lecture) - c.ARRIVAL_BUFFER_MIN,
          "women_only": int(body.women_only)}
    found, earlier = matching.find(me, candidates(s, body.campus), now)
    if not found:
        return {"ride": None, "reason": f"No group of {c.MIN_RIDERS_PER_CAR}+ students nearby for this time yet"}
    ride = {**matching.to_ride(found, me, day), "earlier_min": earlier}
    ride["track"] = timed_path([[ride["pickup"]["lat"], ride["pickup"]["lon"]],
                                *state["ride_paths"][body.campus][body.hood]], found["depart"], found["arrive"])
    internal = {"me": found["group"][0], "ids": [r["id"] for r in found["group"][1:]], "pickup": found["pickup"],
                "depart": found["depart"], "arrive": found["arrive"]}
    # Stored per session, so one judge joining never fills another judge's car.
    db.execute("INSERT OR IGNORE INTO rides (id, session, day, body, internal) VALUES (?, ?, ?, ?, ?)",
               (ride["id"], s["id"], day, json.dumps(ride), json.dumps(internal)))
    return {"ride": ride}


def my_ride(ride_id: str, s: dict, joined=False) -> dict:
    row = db.one("SELECT * FROM rides WHERE id = ? AND session = ?", (ride_id, s["id"]))
    if not row or (joined and not row["joined"]):
        raise HTTPException(404, "Ride not found")
    return {**row, "body": json.loads(row["body"]), "internal": json.loads(row["internal"])}


@app.post("/api/rides/match")
def match(body: Match, s: dict = Depends(session)):
    return find_ride(body, s, c.sim_now(body.now), "today")


@app.post("/api/plan")
def plan(body: Trip, s: dict = Depends(session)):
    """Tomorrow: when the bus is reliable, from past days, and the shared ride that would replace it."""
    _, lat, lon = check_hood(body.hood)
    bus = state["predictor"].plan(lat, lon, body.campus, c.hhmm_to_min(body.lecture))
    ride = find_ride(body, s, 0, "tomorrow")["ride"] if body.campus in c.SYNC_CAMPUSES else None
    return {"bus": bus, "ride": ride}


@app.post("/api/rides/{ride_id}/join")
def join(ride_id: str, body: Clock, s: dict = Depends(session)):
    row = my_ride(ride_id, s)
    ride = row["body"]
    if row["day"] == "today" and c.sim_now(body.now) >= c.hhmm_to_min(ride["depart"]):
        raise HTTPException(409, "This ride has already left. Sync again to find another.")
    db.execute("UPDATE rides SET joined = (id = ?) WHERE session = ? AND day = ?", (ride_id, s["id"], row["day"]))  # one per day
    return {"ride": ride, "status": "confirmed"}


@app.post("/api/rides/{ride_id}/leave")
def leave(ride_id: str, body: Clock, s: dict = Depends(session)):
    row = my_ride(ride_id, s, joined=True)
    if row["day"] == "today" and c.sim_now(body.now) >= row["internal"]["depart"]:
        raise HTTPException(409, "The ride has already left")
    db.execute("UPDATE rides SET joined = 0 WHERE id = ? AND session = ?", (ride_id, s["id"]))
    db.execute("DELETE FROM shares WHERE session = ? AND ride = ?", (s["id"], ride_id))
    return {"status": "left"}


@app.post("/api/rides/{ride_id}/dropout")
def dropout(ride_id: str, body: Clock, s: dict = Depends(session)):
    """Demo control: the last rider leaves. Fill the seat, re-price for 3, or cancel below 3."""
    row = my_ride(ride_id, s, joined=True)
    ride, inner, t = row["body"], row["internal"], c.sim_now(body.now)
    if row["day"] != "today" or t >= inner["depart"]:
        raise HTTPException(409, "The ride has already left")
    gone = db.one("SELECT * FROM students WHERE id = ?", (inner["ids"][-1],))
    db.execute("INSERT OR IGNORE INTO dropped VALUES (?, ?)", (s["id"], gone["id"]))
    pool = candidates(s, ride["campus"])
    by_id = {r["id"]: r for r in pool}
    group = [inner["me"], *(by_id[i] for i in inner["ids"][:-1])]
    new = matching.replacement(group, pool, inner["pickup"], inner["arrive"], inner["depart"], t)
    if new:
        group.append(new)
    if len(group) < c.MIN_RIDERS_PER_CAR:
        db.execute("DELETE FROM rides WHERE id = ? AND session = ?", (ride_id, s["id"]))
        db.execute("DELETE FROM shares WHERE session = ? AND ride = ?", (s["id"], ride_id))
        return {"ride": None, "left": gone["first_name"], "replacement": None}
    ride.update(matching.crew(group))
    inner["ids"] = [r["id"] for r in group[1:]]
    db.execute("UPDATE rides SET body = ?, internal = ? WHERE id = ? AND session = ?",
               (json.dumps(ride), json.dumps(inner), ride_id, s["id"]))
    return {"ride": ride, "left": gone["first_name"], "replacement": new and new["first_name"]}


# --- Family link ---
class ShareClock(BaseModel):
    now: float = Field(ge=0, lt=1440)  # the rider's simulated clock...
    speed: float = Field(default=0, ge=0, le=c.CLOCK_MIN_PER_SEC_JOINED)  # ...and how fast it is running


@app.post("/api/rides/{ride_id}/share")
def share(ride_id: str, body: ShareClock, s: dict = Depends(session)):
    """Create the private link, or refresh where the rider is. The token is the only key."""
    if my_ride(ride_id, s, joined=True)["day"] != "today":
        raise HTTPException(409, "Only today's ride can be shared")
    row = db.one("SELECT token FROM shares WHERE session = ? AND ride = ?", (s["id"], ride_id))
    token = row["token"] if row else secrets.token_urlsafe(16)
    db.execute("INSERT OR REPLACE INTO shares VALUES (?, ?, ?, ?, ?, ?)",
               (token, s["id"], ride_id, body.now, body.speed, time.time()))
    return {"token": token}


@app.post("/api/rides/{ride_id}/unshare")
def unshare(ride_id: str, s: dict = Depends(session)):
    db.execute("DELETE FROM shares WHERE session = ? AND ride = ?", (s["id"], ride_id))
    return {"status": "stopped"}


@app.get("/api/trips/{token}")
def shared_trip(token: str):
    """What family sees: this rider's trip only, never the other students."""
    row = db.one("SELECT shares.now, shares.speed, shares.updated, rides.body, sessions.profile FROM shares "
                 "JOIN rides ON rides.id = shares.ride AND rides.session = shares.session "
                 "JOIN sessions ON sessions.id = shares.session WHERE token = ? AND rides.joined = 1", (token,))
    if not row:
        raise HTTPException(404, "This trip is no longer shared")
    ride = json.loads(row["body"])
    age = time.time() - row["updated"]
    # Keeps moving if the rider's phone sleeps: the simulated trip doesn't depend on their tab being open.
    now = min(row["now"] + age * row["speed"], max(row["now"], c.hhmm_to_min(c.DEMO_NOW) + c.DEMO_RUN_MIN))
    return {"name": json.loads(row["profile"])["first_name"], "now": now, "age_s": round(age),
            **{k: ride[k] for k in ("campus", "depart", "arrive", "riders", "women_only", "track")},
            "pickup": ride["pickup"]["label"]}


@app.post("/api/demo/reset")
def reset(s: dict = Depends(session)):
    db.clear_session(s["id"])
    return {"ok": True}


class FreshStatic(StaticFiles):
    """Browsers re-check every file, so an update never mixes a new page with a cached old script."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


app.mount("/", FreshStatic(directory=c.ROOT / "static", html=True), name="static")
