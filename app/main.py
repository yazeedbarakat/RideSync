import json
import re
import secrets
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config as c
from . import db, matching
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
    yield


app = FastAPI(title="RideSync", lifespan=lifespan)


def session(x_session: str = Header(default="")) -> dict:
    row = db.one("SELECT * FROM sessions WHERE id = ?", (x_session,))
    if not row:
        raise HTTPException(401, "Please verify your student email first")
    return {"id": row["id"], **json.loads(row["profile"])}


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
        "default_lecture": c.DEFAULT_LECTURE, "campuses": c.CAMPUSES,
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
def bus_predictions(route: str | None = None, now: Now = None):
    if route is not None and route not in state["predictor"].routes:
        raise HTTPException(404, "Unknown route")
    t = c.sim_now(now)
    return {"now": c.min_to_hhmm(t), "buses": state["predictor"].predictions(t, route)}


@app.get("/api/model")
def model_metrics():
    return state["predictor"].metrics


@app.get("/api/late-check")
def late_check(hood: str, lecture: str, campus: Literal["JUST", "YU"] = "JUST", now: Now = None):
    if not re.fullmatch(TIME, lecture):
        raise HTTPException(422, "Lecture time must be HH:MM")
    _, lat, lon = check_hood(hood)
    t = c.sim_now(now)
    bus = state["predictor"].next_bus(lat, lon, campus, t)
    lec = c.hhmm_to_min(lecture)
    late = max(0, round(bus["arrival_minute"]) - lec) if bus else None
    full = bool(bus and bus["board"]["level"] == "full")
    return {"lecture": lecture, "bus": bus, "late_min": late, "full": full, "past": lec <= t,
            "suggest_sync": campus in c.SYNC_CAMPUSES and (bus is None or bool(late) or full)}


class Match(BaseModel):
    hood: str
    lecture: str = Field(pattern=TIME)
    campus: Literal["JUST", "YU"] = "JUST"
    women_only: bool = False
    now: str | None = Field(default=None, pattern=TIME)


class Join(BaseModel):
    now: str | None = Field(default=None, pattern=TIME)


@app.post("/api/rides/match")
def match(body: Match, s: dict = Depends(session)):
    if body.campus not in c.SYNC_CAMPUSES:
        raise HTTPException(422, "Shared rides are JUST-only in this pilot")
    if body.women_only and s["gender"] != "F":
        raise HTTPException(403, "Women-only rides need a verified female student profile")
    _, lat, lon = check_hood(body.hood)
    me = {"id": 0, "first_name": s["first_name"], "gender": s["gender"], "hood": body.hood, "lat": lat, "lon": lon,
          "campus": body.campus, "desired_arrival": c.hhmm_to_min(body.lecture) - c.ARRIVAL_BUFFER_MIN,
          "women_only": int(body.women_only)}
    pool = db.all_rows("SELECT * FROM students WHERE campus = ?", (body.campus,))
    found = matching.best_group(me, pool, c.sim_now(body.now))
    if not found:
        return {"ride": None, "reason": f"No group of {c.MIN_RIDERS_PER_CAR}+ students nearby for this time yet"}
    ride = matching.to_ride(found, me)
    # Stored per session, so one judge joining never fills another judge's car.
    db.execute("INSERT OR IGNORE INTO rides (id, session, body) VALUES (?, ?, ?)", (ride["id"], s["id"], json.dumps(ride)))
    return {"ride": ride}


@app.post("/api/rides/{ride_id}/join")
def join(ride_id: str, body: Join, s: dict = Depends(session)):
    row = db.one("SELECT * FROM rides WHERE id = ? AND session = ?", (ride_id, s["id"]))
    if not row:
        raise HTTPException(404, "Ride not found")
    ride = json.loads(row["body"])
    if c.sim_now(body.now) >= c.hhmm_to_min(ride["depart"]):
        raise HTTPException(409, "This ride has already left. Sync again to find another.")
    db.execute("UPDATE rides SET joined = (id = ?) WHERE session = ?", (ride_id, s["id"]))  # one active ride
    return {"ride": ride, "status": "confirmed"}


app.mount("/", StaticFiles(directory=c.ROOT / "static", html=True), name="static")
