"""A shared ride after it's offered: states, ready check, driver, leaving, chat and summary.

Ride states (NextStop SPEC v5 §3.3):
  offered -> OPEN -> READY_CHECK -> DISPATCHED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
  and CANCELED (no driver found).
`data` is one visitor's ride, stored as JSON. Every function here takes the visitor's
simulated minute `now`; only the simulated riders' Ready answers use real seconds.
"""
import re
import time

from . import config as c
from . import fare

ACTIVE = ("OPEN", "READY_CHECK", "DISPATCHED", "ACCEPTED")
# What simulated riders say when the visitor joins (demo content).
HELLO = ["Hi everyone 👋", "I'll be at the meeting point a few minutes early", "Hello!"]

PHONE = re.compile(r"\+?\d(?:[\s-]?\d){6,}")
LINK = re.compile(r"(?i)\b(?:https?://|www\.)\S+|\b[\w-]+\.(?:com|net|org|jo|io|me|app|ly|co|gg)\b(?:/\S*)?")


def mask(text: str) -> str:
    """Phone numbers (7+ digits, spaces or dashes allowed) and links never reach the chat."""
    return LINK.sub("•••", PHONE.sub("•••", text))


def riders(data) -> int:
    return 1 + len(data["crew"])


def reprice(data, late=False):
    """Shares after someone joins or leaves. A late leaver's share is a credit on the ride,
    and with credits the others' share never goes up (SPEC §3.10)."""
    new = fare.share(data["fare"], riders(data), data["credit"])
    data["share"] = min(data["share"], new) if late else new


def leave_is_late(data, now) -> bool:
    return data["state"] == "ACCEPTED" and data["depart"] - now < c.LATE_LEAVE_MIN


def say(msgs, text, who=None):
    msgs.append({"who": who, "text": text})


def start_ready_check(data, now, msgs, by="You"):
    data["state"] = "READY_CHECK"
    data["ready"] = {"started": time.time(), "at": now, "me": None, "answered": []}
    say(msgs, f"{by} started the ready check" if by != "auto" else "The ready check started")


def advance(data, now, msgs) -> bool:
    """Move the ride on to where it should be at `now`. Returns True if anything changed."""
    before = (data["state"], len(msgs))
    if data["state"] == "OPEN" and now >= data["depart"] - c.READY_CHECK_LEAD_MIN:
        start_ready_check(data, now, msgs, "auto")
    if data["state"] == "READY_CHECK":
        r = data["ready"]
        elapsed = time.time() - r["started"]
        for i, p in enumerate(data["crew"]):
            if p["id"] not in r["answered"] and elapsed >= c.SIM_READY_AFTER_S[i % len(c.SIM_READY_AFTER_S)]:
                r["answered"].append(p["id"])
                say(msgs, f"{p['first_name']} is ready")
        crew_done = len(r["answered"]) >= len(data["crew"])
        if (r["me"] and crew_done) or now >= r["at"] + c.READY_CHECK_MIN:  # no answer = ready
            data["state"] = "DISPATCHED"
            data["driver_idx"] = 0
            say(msgs, "Everyone's ready. Finding your driver")
    if data["state"] == "DISPATCHED" and now >= data["depart"] - c.RESPOND_BY_LEAD_MIN:
        cancel(data, msgs, "No driver accepted in time. Nobody is charged.")
    if data["state"] == "ACCEPTED" and now >= data["depart"]:
        data["state"] = "IN_PROGRESS"
    if data["state"] == "IN_PROGRESS" and now >= data["arrive"]:
        complete(data, msgs)
    return (data["state"], len(msgs)) != before


def cancel(data, msgs, reason):
    data["state"] = "CANCELED"
    data["cancel_reason"] = reason
    say(msgs, reason)


def complete(data, msgs):
    data["state"] = "COMPLETED"
    say(msgs, f"Arrived at {c.CAMPUSES[data['campus']]['name']}. Thanks for riding together")


def answer_ready(data, ready: bool, msgs):
    if data["state"] != "READY_CHECK":
        raise ValueError("The ready check isn't running")
    if ready:
        data["ready"]["me"] = "ready"
        say(msgs, "You're ready")


def driver_offer(data) -> dict:
    """What the driver sees: the whole trip, first names, and the cash to collect."""
    d = c.DRIVERS[min(data.get("driver_idx", 0), len(c.DRIVERS) - 1)]
    n = riders(data)
    names = ["You", *(p["first_name"] for p in data["crew"])]
    return {
        "driver": data.get("driver") or d, "state": data["state"], "fare": data["fare"], "riders": n,
        "share": data["share"], "collect": round(data["share"] * n, 2), "credit": data["credit"],
        "km": data["km"], "minutes": data["minutes"], "first_pickup": c.min_to_hhmm(data["depart"]),
        "respond_by": c.min_to_hhmm(data["depart"] - c.RESPOND_BY_LEAD_MIN), "payment": "cash",
        "left": data["left"],
        "stops": [{"kind": "pickup", "label": data["label"], "time": c.min_to_hhmm(data["depart"]), "names": names},
                  {"kind": "dropoff", "label": c.CAMPUSES[data["campus"]]["name"], "time": c.min_to_hhmm(data["arrive"])}],
    }


def driver_answer(data, accept: bool, msgs):
    if data["state"] != "DISPATCHED":
        raise ValueError("This offer is no longer open")
    d = c.DRIVERS[data["driver_idx"]]
    if accept:
        data["state"] = "ACCEPTED"
        data["driver"] = d
        say(msgs, f"{d['name']} is your driver · {d['car']} · {d['plate']}")
        return
    data["driver_idx"] += 1
    if data["driver_idx"] >= len(c.DRIVERS):
        cancel(data, msgs, "No driver found. Nobody is charged.")
    else:
        say(msgs, "Still finding your driver")


def co_rider_leaves(data, now, msgs, pool_replacement=None):
    """Demo control: the last co-rider leaves. Before the ready check a nearby rider can take
    the seat; after it, the seat stays empty (SPEC §3.10)."""
    if data["state"] not in ACTIVE:
        raise ValueError("The ride has already left")
    gone = data["crew"].pop()
    late = leave_is_late(data, now)
    entry = {"name": gone["first_name"], "late": late, "charge": data["share"] if late else 0.0}
    data["left"].append(entry)
    if late:
        data["credit"] = round(data["credit"] + data["share"], 2)
    new = pool_replacement(data, gone) if data["state"] == "OPEN" and pool_replacement else None
    if new:
        data["crew"].append(new)
        say(msgs, f"{gone['first_name']} left. {new['first_name']} took the seat")
    else:
        say(msgs, f"{gone['first_name']} left" + (f" late and pays their own share (JOD {entry['charge']:.2f})" if late else ""))
    reprice(data, late)
    return gone, new, entry


def view(data, now) -> dict:
    """The rider's view. Other riders are first names only, never their locations."""
    n = riders(data)
    ready = data.get("ready") or {}
    out = {
        "id": data["id"], "day": data["day"], "campus": data["campus"], "state": data["state"],
        "riders": n, "others": [{"name": p["first_name"], "ready": p["id"] in ready.get("answered", [])} for p in data["crew"]],
        "share": data["share"], "fare": data["fare"], "solo": data["solo"],
        "saved": round(max(0.0, data["solo"] - data["share"]), 2), "credit": data["credit"],
        "alone": fare.up05(data["fare"]), "max_riders": c.MAX_RIDERS_PER_CAR,
        "pickup": {**data["pickup"], "label": data["label"], "walk_m": data["walk_m"]},
        "depart": c.min_to_hhmm(data["depart"]), "arrive": c.min_to_hhmm(data["arrive"]),
        "distance_km": data["km"], "minutes": data["minutes"], "earlier_min": data["earlier_min"],
        "track": data["track"], "left": data["left"], "driver": data.get("driver"),
        "balance_added": data.get("balance_added", 0.0),
        "join_closes": c.min_to_hhmm(data["depart"] - c.JOIN_LEAD_MIN),
        "leave_cost": data["share"] if leave_is_late(data, now) else 0.0,
        "late_from": c.min_to_hhmm(data["depart"] - c.LATE_LEAVE_MIN),
    }
    if data["state"] == "READY_CHECK":
        out["ready_check"] = {"me": ready.get("me"), "ends": c.min_to_hhmm(ready["at"] + c.READY_CHECK_MIN)}
    if data["state"] == "CANCELED":
        out["cancel_reason"] = data.get("cancel_reason")
    if data["state"] == "COMPLETED":
        cash = round(data["share"] * n, 2)
        out["summary"] = {"arrived": c.min_to_hhmm(data["arrive"]), "paid": data["share"], "riders": n,
                          "saved": out["saved"], "driver": data["driver"]["name"], "cash": cash,
                          "credit": data["credit"], "driver_total": round(cash + data["credit"], 2)}
    return out
