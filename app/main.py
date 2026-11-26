import json
import re
import secrets
import socket
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config as c
from . import db, fare, matching, rides
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
        raise HTTPException(401, "Please sign in first")
    return {"id": row["id"], "balance": row["balance"], **json.loads(row["profile"])}


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


def from_price(hood: str, lecture: str, campus: str = "JUST") -> float:
    """"From JOD x": a full car of 4 from this area, for this arrive-by."""
    _, lat, lon = c.HOODS[hood]
    trip = fare.trip(lat, lon, campus, c.hhmm_to_min(lecture) - c.ARRIVAL_BUFFER_MIN)
    return fare.share(trip["fare"], c.MAX_RIDERS_PER_CAR)


def lan_ip() -> str | None:
    """This computer's address on the local network. Connecting a UDP socket sends nothing."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))
            return sock.getsockname()[0]
    except OSError:
        return None


def share_url(request: Request) -> str:
    """The address a phone can open, for the in-app QR code."""
    if c.PUBLIC_URL:
        return c.PUBLIC_URL
    host = request.url.hostname or ""
    if host not in ("localhost", "127.0.0.1", "::1"):
        return str(request.base_url)
    ip = lan_ip()
    port = request.url.port
    return f"http://{ip}{f':{port}' if port and port != 80 else ''}/" if ip else str(request.base_url)


@app.get("/api/config")
def get_config(request: Request):
    return {
        "share_url": share_url(request),
        "now": c.DEMO_NOW,
        "clock": {"start": c.hhmm_to_min(c.DEMO_NOW), "hold_after": c.DEMO_HOLD_AFTER_MIN, "run": c.DEMO_RUN_MIN,
                  "speed": c.CLOCK_MIN_PER_SEC, "speed_joined": c.CLOCK_MIN_PER_SEC_JOINED},
        "dow": c.DEMO_DOW, "default_lecture": c.DEFAULT_LECTURE, "campuses": c.CAMPUSES,
        "sync_campuses": sorted(c.SYNC_CAMPUSES), "min_riders": c.MIN_RIDERS_PER_CAR,
        "max_riders": c.MAX_RIDERS_PER_CAR, "late_leave_min": c.LATE_LEAVE_MIN, "join_lead_min": c.JOIN_LEAD_MIN,
        "chat_max": c.CHAT_MAX_CHARS,
        "hoods": [{"id": k, "name": v[0], "lat": v[1], "lon": v[2]} for k, v in c.HOODS.items()],
    }


@app.get("/api/map")
def get_map():
    """The browser needs this key to load Google tiles, so it must be restricted to this site."""
    return {"google_key": c.GOOGLE_MAPS_KEY}


@app.get("/api/price")
def price(hood: str, lecture: str = Query(pattern=TIME), campus: Literal["JUST", "YU"] = "JUST"):
    check_hood(hood)
    if campus not in c.SYNC_CAMPUSES:
        raise HTTPException(422, "Shared rides go to JUST only in this pilot")
    return {"from": from_price(hood, lecture, campus)}


@app.get("/api/solo")
def solo(hood: str, campus: Literal["JUST", "YU"] = "JUST", now: Now = None):
    """A normal Jeeny ride (Economy), leaving now: one rider, door to campus, same tariff."""
    _, lat, lon = check_hood(hood)
    t = c.sim_now(now)
    trip = fare.drive(fare.leg_km(lat, lon, campus), t)
    return {"fare": fare.up05(trip["fare"]), "minutes": round(trip["minutes"]), "km": trip["km"],
            "arrive": c.min_to_hhmm(trip["drop"]), "driver": c.DRIVERS[0], "pickup_in": 4}


class Login(BaseModel):
    demo: Literal["ahmad", "lina"] | None = None
    first_name: str | None = Field(default=None, min_length=1, max_length=30)
    gender: Literal["F", "M"] | None = None


@app.post("/api/login")
def login(body: Login):
    """Seeded demo logins, or a name + gender signup. Gender is set once and can't be changed."""
    if body.demo:
        profile = dict(c.DEMO_ACCOUNTS[body.demo])
    else:
        name = (body.first_name or "").strip()
        if not name or not body.gender:
            raise HTTPException(422, "Enter your first name and gender")
        profile = {"first_name": name, "gender": body.gender, "hood": "andalus", "lecture": c.DEFAULT_LECTURE}
    sid = secrets.token_urlsafe(24)
    db.execute("INSERT INTO sessions (id, profile) VALUES (?, ?)", (sid, json.dumps(profile)))
    return {"session": sid, "profile": profile}


@app.get("/api/me")
def whoami(s: dict = Depends(session)):
    return {"profile": {k: s[k] for k in ("first_name", "gender", "hood", "lecture")}, "balance": s["balance"]}


@app.get("/api/buses/predictions")
def bus_predictions(route: str | None = None, now: Now = None, reports: list = Depends(my_reports)):
    if route is not None and route not in state["predictor"].routes:
        raise HTTPException(404, "Unknown route")
    t = c.bus_now(now)
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
    t = c.bus_now(body.now)
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
    t = c.bus_now(now)
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


class Match(Trip):
    now: str | None = Field(default=None, pattern=TIME)


class Clock(BaseModel):
    now: str | None = Field(default=None, pattern=TIME)


def candidates(s: dict, campus: str) -> list:
    """Riders who could share with this visitor (minus anyone who left a car on them)."""
    return db.all_rows("SELECT * FROM students WHERE campus = ? AND id NOT IN "
                       "(SELECT student FROM dropped WHERE session = ?)", (campus, s["id"]))


def find_ride(body: Trip, s: dict, now: int, day: str) -> dict:
    if body.campus not in c.SYNC_CAMPUSES:
        raise HTTPException(422, "Shared rides go to JUST only in this pilot")
    _, lat, lon = check_hood(body.hood)
    me = {"id": 0, "first_name": s["first_name"], "gender": s["gender"], "hood": body.hood, "lat": lat, "lon": lon,
          "campus": body.campus, "desired_arrival": c.hhmm_to_min(body.lecture) - c.ARRIVAL_BUFFER_MIN}
    found, earlier = matching.find(me, candidates(s, body.campus), now)
    if not found:
        return {"ride": None, "reason": f"No group of {c.MIN_RIDERS_PER_CAR}+ riders nearby for this time yet", "balance": s["balance"]}
    group = found["group"]
    rid = matching.ride_id(day, group, found["depart"], body.campus)
    old = db.one("SELECT * FROM rides WHERE id = ? AND session = ?", (rid, s["id"]))
    if old and old["joined"]:
        return {"ride": rides.view(json.loads(old["data"]), now), "balance": s["balance"]}
    pickup = {"lat": round(found["pickup"]["lat"], 5), "lon": round(found["pickup"]["lon"], 5)}
    data = {
        "id": rid, "day": day, "campus": body.campus, "state": "offered", "me": me,
        "crew": [{k: r[k] for k in ("id", "first_name", "gender", "lat", "lon", "campus", "desired_arrival")} for r in group[1:]],
        "pickup": pickup, "label": f"{c.HOODS[body.hood][0]} meeting point", "walk_m": round(found["walks"][0] / 10) * 10,
        "depart": found["depart"], "arrive": found["arrive"], "km": found["km"], "minutes": found["minutes"],
        "fare": found["fare"], "credit": 0.0, "solo": matching.solo_fare(me), "earlier_min": earlier, "left": [],
        "track": timed_path([[pickup["lat"], pickup["lon"]], *state["ride_paths"][body.campus][body.hood]],
                            found["depart"], found["arrive"]),
    }
    rides.reprice(data)
    # Stored per session, so one judge joining never fills another judge's car.
    db.execute("INSERT OR REPLACE INTO rides (id, session, day, data, joined) VALUES (?, ?, ?, ?, 0)",
               (rid, s["id"], day, json.dumps(data)))
    db.execute("DELETE FROM chat WHERE session = ? AND ride = ?", (s["id"], rid))
    return {"ride": rides.view(data, now), "balance": s["balance"]}


def load(ride_id: str, s: dict, joined=True) -> dict:
    row = db.one("SELECT * FROM rides WHERE id = ? AND session = ?", (ride_id, s["id"]))
    if not row or (joined and not row["joined"]):
        raise HTTPException(404, "Ride not found")
    return json.loads(row["data"])


def store(data: dict, s: dict, msgs: list = (), now: int | None = None):
    db.execute("UPDATE rides SET data = ? WHERE id = ? AND session = ?", (json.dumps(data), data["id"], s["id"]))
    at = c.min_to_hhmm(now) if now is not None else None  # the visitor's simulated time
    for m in msgs:
        db.execute("INSERT INTO chat (session, ride, who, text, at) VALUES (?, ?, ?, ?, ?)", (s["id"], data["id"], m["who"], m["text"], at))


def chat_of(ride_id: str, s: dict, after: int = 0) -> list:
    rows = db.all_rows("SELECT seq, who, text, at FROM chat WHERE session = ? AND ride = ? AND seq > ? ORDER BY seq DESC LIMIT ?",
                       (s["id"], ride_id, after, c.CHAT_HISTORY))
    return rows[::-1]


def current(ride_id: str, s: dict, now: int) -> tuple[dict, list]:
    """Load a joined ride and move it on to `now`."""
    data, msgs = load(ride_id, s), []
    if data["day"] == "today" and rides.advance(data, now, msgs):
        store(data, s, msgs, now)
    return data, msgs


def reply(data: dict, s: dict, now: int, after: int = 0) -> dict:
    return {"ride": rides.view(data, now), "chat": chat_of(data["id"], s, after)}


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
    """Auto-join: no approval. Joining closes 45 min before pickup."""
    data, now = load(ride_id, s, joined=False), c.sim_now(body.now)
    if data["state"] != "offered":
        raise HTTPException(409, "This ride is no longer available. Sync again to find another.")
    if data["day"] == "today" and now > data["depart"] - c.JOIN_LEAD_MIN:
        raise HTTPException(409, f"Joining closed {c.JOIN_LEAD_MIN} min before pickup. Sync again to find another.")
    for old in db.all_rows("SELECT * FROM rides WHERE session = ? AND day = ? AND joined = 1", (s["id"], data["day"])):
        if json.loads(old["data"])["state"] not in ("OPEN", "CANCELED", "COMPLETED"):
            raise HTTPException(409, "Leave your current ride first")
    db.execute("UPDATE rides SET joined = (id = ?) WHERE session = ? AND day = ?", (ride_id, s["id"], data["day"]))  # one per day
    data["state"] = "OPEN"
    if data["day"] == "today" and s["balance"]:
        data["balance_added"] = s["balance"]  # Jeeny's outstanding-balance fee, added to this booking
        db.execute("UPDATE sessions SET balance = 0 WHERE id = ?", (s["id"],))
    names = [p["first_name"] for p in data["crew"]]
    msgs = [{"who": None, "text": "You joined. " + ", ".join(names) + (" is" if len(names) == 1 else " are") + " in this ride"}]
    msgs += [{"who": p["first_name"], "text": rides.HELLO[i]} for i, p in enumerate(data["crew"][:2])]
    store(data, s, msgs, now)
    return reply(data, s, now)


@app.get("/api/rides/{ride_id}")
def ride_now(ride_id: str, now: Now = None, after: int = 0, s: dict = Depends(session)):
    """The rider's screen polls this: state, ready answers, driver and new chat messages."""
    t = c.sim_now(now)
    data, _ = current(ride_id, s, t)
    return reply(data, s, t, after)


@app.post("/api/rides/{ride_id}/find-driver")
def find_driver(ride_id: str, body: Clock, s: dict = Depends(session)):
    """Starts the ready check. Joining closes and the pickup time is final from here."""
    t = c.sim_now(body.now)
    data, msgs = current(ride_id, s, t)
    if data["day"] != "today" or data["state"] != "OPEN":
        raise HTTPException(409, "The ready check has already started")
    rides.start_ready_check(data, t, msgs := [], "You")
    store(data, s, msgs, t)
    return reply(data, s, t)


class Ready(Clock):
    ready: bool


@app.post("/api/rides/{ride_id}/ready")
def ready(ride_id: str, body: Ready, s: dict = Depends(session)):
    t = c.sim_now(body.now)
    data, _ = current(ride_id, s, t)
    if not body.ready:  # "Cancel ride for me" is always free during the ready check
        return leave(ride_id, body, s)
    try:
        rides.answer_ready(data, True, msgs := [])
    except ValueError as e:
        raise HTTPException(409, str(e))
    rides.advance(data, t, msgs)
    store(data, s, msgs, t)
    return reply(data, s, t)


@app.get("/api/rides/{ride_id}/offer")
def offer(ride_id: str, now: Now = None, s: dict = Depends(session)):
    """Demo: the driver's app for this ride."""
    data, _ = current(ride_id, s, c.sim_now(now))
    if data["state"] not in ("DISPATCHED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"):
        raise HTTPException(409, "Drivers see the ride once everyone is ready")
    return rides.driver_offer(data)


class DriverAnswer(Clock):
    accept: bool


@app.post("/api/rides/{ride_id}/driver")
def driver(ride_id: str, body: DriverAnswer, s: dict = Depends(session)):
    t = c.sim_now(body.now)
    data, _ = current(ride_id, s, t)
    try:
        rides.driver_answer(data, body.accept, msgs := [])
    except ValueError as e:
        raise HTTPException(409, str(e))
    store(data, s, msgs, t)
    return {**reply(data, s, t), "offer": rides.driver_offer(data)}


@app.post("/api/rides/{ride_id}/leave")
def leave(ride_id: str, body: Clock, s: dict = Depends(session)):
    """Free until a driver accepts, and after that until 30 min before pickup.
    Later, you pay your own share (added to your next booking), so the others don't pay for you."""
    t = c.sim_now(body.now)
    data, _ = current(ride_id, s, t)
    if data["state"] not in rides.ACTIVE:
        raise HTTPException(409, "The ride has already left")
    late = rides.leave_is_late(data, t)
    charge = data["share"] if late else 0.0
    if charge:
        db.execute("UPDATE sessions SET balance = balance + ? WHERE id = ?", (charge, s["id"]))
    db.execute("UPDATE rides SET joined = 0, data = ? WHERE id = ? AND session = ?",
               (json.dumps({**data, "state": "LEFT"}), ride_id, s["id"]))
    return {"status": "left", "late": late, "charge": charge}


@app.post("/api/rides/{ride_id}/dropout")
def dropout(ride_id: str, body: Clock, s: dict = Depends(session)):
    """Demo control: the last co-rider leaves, under the same rules as you."""
    t = c.sim_now(body.now)
    data, _ = current(ride_id, s, t)
    if data["day"] != "today" or not data["crew"]:
        raise HTTPException(409, "Nobody else is left in this ride")

    def refill(d, gone):
        pool = candidates(s, d["campus"])
        new = matching.replacement([d["me"], *d["crew"]], pool, d["pickup"], d["arrive"], d["depart"], t)
        return new and {k: new[k] for k in ("id", "first_name", "gender", "lat", "lon", "campus", "desired_arrival")}

    try:
        gone, new, entry = rides.co_rider_leaves(data, t, msgs := [], refill)
    except ValueError as e:
        raise HTTPException(409, str(e))
    db.execute("INSERT OR IGNORE INTO dropped VALUES (?, ?)", (s["id"], gone["id"]))
    store(data, s, msgs, t)
    return {**reply(data, s, t), "left": entry, "replacement": new and new["first_name"]}


@app.post("/api/rides/{ride_id}/complete")
def complete(ride_id: str, body: Clock, s: dict = Depends(session)):
    """Demo control: mark the trip done and show the summary."""
    t = c.sim_now(body.now)
    data, _ = current(ride_id, s, t)
    if data["state"] not in ("ACCEPTED", "IN_PROGRESS"):
        raise HTTPException(409, "The trip needs a driver first")
    rides.complete(data, msgs := [])
    store(data, s, msgs, t)
    return reply(data, s, t)


class Say(BaseModel):
    text: str = Field(min_length=1, max_length=c.CHAT_MAX_CHARS)
    after: int = 0
    now: str | None = Field(default=None, pattern=TIME)


@app.post("/api/rides/{ride_id}/chat")
def chat(ride_id: str, body: Say, s: dict = Depends(session)):
    """Group chat for the riders. Phone numbers and links are masked before they're stored."""
    data = load(ride_id, s)
    if data["state"] in ("COMPLETED", "CANCELED"):
        raise HTTPException(409, "This chat is read-only now")
    text = rides.mask(body.text.strip())
    if not text:
        raise HTTPException(422, "Type a message")
    store(data, s, [{"who": s["first_name"], "text": text}], c.sim_now(body.now))
    return {"chat": chat_of(ride_id, s, body.after)}


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
