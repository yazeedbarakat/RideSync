"""Bus model features (backend only) and the shared-ride lifecycle ported from NextStop."""
import pytest
from fastapi.testclient import TestClient

from app import config as c
from app import rides
from app.main import app

from .test_demo import login, match

AHMAD, LINA = "ahmad", "lina"


@pytest.fixture(scope="module")
def api():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def instant(monkeypatch):
    """Simulated riders answer the ready check at once."""
    monkeypatch.setattr(c, "SIM_READY_AFTER_S", (0, 0, 0))


def late(api, lecture="08:00", headers=None, **kw):
    return api.get("/api/late-check", params={"hood": "andalus", "lecture": lecture, **kw}, headers=headers or {}).json()


def joined(api, h, now="06:12", **kw):
    ride = match(api, h, **kw).json()["ride"]
    r = api.post(f"/api/rides/{ride['id']}/join", headers=h, json={"now": now})
    assert r.status_code == 200
    return r.json()["ride"]


def post(api, h, ride, action, **body):
    return api.post(f"/api/rides/{ride['id']}/{action}", headers=h, json=body)


def get(api, h, ride, **params):
    return api.get(f"/api/rides/{ride['id']}", headers=h, params=params).json()


def accepted(api, who=AHMAD):
    h = login(api, who)
    ride = joined(api, h)
    post(api, h, ride, "find-driver", now="06:12")
    assert post(api, h, ride, "ready", ready=True, now="06:12").json()["ride"]["state"] == "DISPATCHED"
    assert post(api, h, ride, "driver", accept=True, now="06:12").json()["ride"]["state"] == "ACCEPTED"
    return h, ride


# --- Arrival range ---
def test_range_holds_the_point_forecast_and_risk_falls_with_later_lectures(api):
    for b in api.get("/api/buses/predictions").json()["buses"]:
        assert b["arrival_low"] <= b["arrival"] <= b["arrival_high"]
    risks = [late(api, f"08:{m:02d}")["late_risk"] for m in range(0, 60, 5)]
    assert risks == sorted(risks, reverse=True) and risks[0] > 0.9
    assert all(c.QUANTILES[0] <= round(r, 2) <= c.QUANTILES[-1] for r in risks)
    assert 0.7 <= api.get("/api/model").json()["range_coverage"] <= 0.9


def test_risky_bus_suggests_a_ride_even_if_the_best_guess_is_on_time(api):
    r = late(api, "08:15")
    assert r["late_min"] == 0 and r["risky"] and r["suggest_sync"]


# --- Bus reports ---
def report(api, h, bus="B2", **kw):
    return api.post(f"/api/buses/{bus}/report", headers=h, json={"stop": 0, "level": "full", "now": "07:10", **kw})


def test_report_updates_only_that_visitor_and_only_from_then_on(api):
    a, b = login(api, AHMAD), login(api, LINA)
    r = report(api, a).json()
    assert r["before"] == "08:14" and r["after"] < r["before"]
    assert late(api, headers=a, now="07:10")["bus"]["reported"] == "07:10"
    assert late(api, headers=a, now="07:09")["bus"]["arrival"] == "08:14"  # nothing known before the report
    for h in (b, {}):
        assert late(api, headers=h, now="07:10")["bus"]["arrival"] == "08:14"
    api.post("/api/demo/reset", headers=a)
    assert late(api, headers=a, now="07:10")["bus"]["arrival"] == "08:14"


def test_impossible_reports_are_rejected(api):
    h = login(api, AHMAD)
    assert report(api, h, bus="B9").status_code == 404
    assert report(api, {}).status_code == 401
    assert report(api, h, bus="B1", stop=0).status_code == 422  # already past it
    assert report(api, h, bus="B1", stop=1, waiting=True).status_code == 422
    assert report(api, h, stop=4).status_code == 422  # the campus itself
    assert report(api, h, level="empty").status_code == 422
    assert report(api, h, now="08:20").status_code == 409  # arrived


# --- Ride lifecycle (NextStop SPEC v5 §3) ---
def test_ready_check_driver_trip_and_summary(api, instant):
    h = login(api, AHMAD)
    ride = joined(api, h)
    assert ride["state"] == "OPEN" and ride["share"] == 1.75
    assert api.get(f"/api/rides/{ride['id']}/offer", headers=h).status_code == 409  # drivers see it only once dispatched
    r = post(api, h, ride, "find-driver", now="06:12").json()
    assert r["ride"]["state"] == "READY_CHECK" and any("started the ready check" in m["text"] for m in r["chat"])
    assert post(api, h, ride, "find-driver", now="06:12").status_code == 409
    r = post(api, h, ride, "ready", ready=True, now="06:12").json()
    assert r["ride"]["state"] == "DISPATCHED" and all(o["ready"] for o in r["ride"]["others"])
    offer = api.get(f"/api/rides/{ride['id']}/offer", headers=h).json()
    assert (offer["fare"], offer["riders"], offer["collect"], offer["first_pickup"], offer["respond_by"]) == (6.87, 4, 7.00, "07:15", "07:00")
    assert offer["collect"] >= offer["fare"] and offer["driver"]["name"] == c.DRIVERS[0]["name"]
    r = post(api, h, ride, "driver", accept=False, now="06:12").json()  # the offer goes to the next driver
    assert r["ride"]["state"] == "DISPATCHED" and r["offer"]["driver"]["name"] == c.DRIVERS[1]["name"]
    r = post(api, h, ride, "driver", accept=True, now="06:12").json()
    assert r["ride"]["state"] == "ACCEPTED" and r["ride"]["driver"]["name"] == c.DRIVERS[1]["name"]
    assert get(api, h, ride, now="07:15")["ride"]["state"] == "IN_PROGRESS"
    done = get(api, h, ride, now="07:48")["ride"]
    assert done["state"] == "COMPLETED"
    assert done["summary"] == {"arrived": "07:48", "paid": 1.75, "riders": 4, "saved": 5.15, "driver": c.DRIVERS[1]["name"],
                               "cash": 7.0, "credit": 0.0, "driver_total": 7.0}
    assert post(api, h, ride, "chat", text="thanks").status_code == 409  # read-only after the trip


def test_ready_check_starts_by_itself_and_no_answer_counts_as_ready(api, monkeypatch):
    monkeypatch.setattr(c, "SIM_READY_AFTER_S", (999, 999, 999))
    h = login(api, LINA)
    ride = joined(api, h)
    assert get(api, h, ride, now="06:30")["ride"]["state"] == "OPEN"
    assert get(api, h, ride, now="06:31")["ride"]["state"] == "READY_CHECK"  # pickup 07:16 - 45 min
    assert get(api, h, ride, now="06:35")["ride"]["state"] == "READY_CHECK"
    assert get(api, h, ride, now="06:36")["ride"]["state"] == "DISPATCHED"  # 5 min passed


def test_no_driver_cancels_without_fees(api, instant):
    h = login(api, AHMAD)
    ride = joined(api, h)
    post(api, h, ride, "find-driver", now="06:12")
    post(api, h, ride, "ready", ready=True, now="06:12")
    r = get(api, h, ride, now="07:00")["ride"]  # respond-by = pickup - 15 min
    assert r["state"] == "CANCELED" and "Nobody is charged" in r["cancel_reason"]
    h2 = login(api, AHMAD)
    ride2 = joined(api, h2)
    post(api, h2, ride2, "find-driver", now="06:12")
    post(api, h2, ride2, "ready", ready=True, now="06:12")
    for _ in c.DRIVERS:
        r = post(api, h2, ride2, "driver", accept=False, now="06:12").json()
    assert r["ride"]["state"] == "CANCELED"
    assert post(api, h2, ride2, "leave", now="06:12").status_code == 409


# --- Leaving (SPEC §3.10) ---
def test_co_rider_leaves_free_before_the_ready_check_and_the_seat_refills_or_reprices(api):
    h = login(api, AHMAD)
    ride = joined(api, h)
    r = post(api, h, ride, "dropout", now="06:12").json()
    assert r["left"]["late"] is False and r["ride"]["riders"] in (3, 4)
    if r["replacement"]:
        assert r["ride"]["riders"] == 4 and r["ride"]["share"] <= 1.75
    while r["ride"]["others"]:
        r = post(api, h, ride, "dropout", now="06:12").json()
    assert r["ride"]["riders"] == 1 and r["ride"]["share"] == r["ride"]["alone"]  # it still goes, at the solo price
    assert post(api, h, ride, "dropout", now="06:12").status_code == 409


def test_co_rider_late_leave_pays_their_share_and_yours_never_goes_up(api, instant):
    h, ride = accepted(api)
    before = get(api, h, ride, now="06:12")["ride"]
    r = post(api, h, ride, "dropout", now="06:50").json()  # 25 min before the 07:15 pickup
    assert r["left"] == {"name": before["others"][-1]["name"], "late": True, "charge": 1.75}
    assert r["replacement"] is None and r["ride"]["riders"] == 3  # no replacements after the ready check
    assert r["ride"]["share"] <= before["share"] and r["ride"]["credit"] == 1.75
    offer = api.get(f"/api/rides/{ride['id']}/offer", headers=h).json()
    assert offer["collect"] + offer["credit"] >= offer["fare"]  # the driver still gets the full fare
    s = post(api, h, ride, "complete", now="06:51").json()["ride"]["summary"]
    assert (s["cash"], s["credit"], s["driver_total"]) == (5.25, 1.75, 7.0)


def test_co_rider_free_leave_after_accept_raises_the_share(api, instant):
    h, ride = accepted(api)
    r = post(api, h, ride, "dropout", now="06:44").json()  # 31 min before pickup: still free
    assert r["left"]["late"] is False and r["ride"]["credit"] == 0 and r["ride"]["share"] == 2.30  # 6.87 / 3


def test_your_late_leave_is_charged_on_your_next_booking(api, instant):
    h, ride = accepted(api)
    assert get(api, h, ride, now="06:45")["ride"]["leave_cost"] == 0
    assert get(api, h, ride, now="06:46")["ride"]["leave_cost"] == 1.75
    r = post(api, h, ride, "leave", now="06:46").json()
    assert (r["late"], r["charge"]) == (True, 1.75)
    assert api.get("/api/me", headers=h).json()["balance"] == 1.75
    assert get(api, h, ride).get("detail") == "Ride not found"
    again = match(api, h, lecture="09:00", now="06:46").json()
    assert again["balance"] == 1.75
    j = post(api, h, again["ride"], "join", now="06:46").json()["ride"]
    assert j["balance_added"] == 1.75 and api.get("/api/me", headers=h).json()["balance"] == 0


def test_leaving_before_a_driver_accepts_is_free(api, instant):
    for step in ("OPEN", "READY_CHECK"):
        h = login(api, LINA)
        ride = joined(api, h)
        if step == "READY_CHECK":
            post(api, h, ride, "find-driver", now="06:12")
            r = post(api, h, ride, "ready", ready=False, now="06:12").json()  # "Cancel ride for me"
        else:
            r = post(api, h, ride, "leave", now="06:12").json()
        assert (r["late"], r["charge"]) == (False, 0)
        assert api.get("/api/me", headers=h).json()["balance"] == 0


# --- Group chat ---
@pytest.mark.parametrize("text,shown", [
    ("call me 0791234567", "call me •••"), ("079 123 4567 or +962-79-123-4567", "••• or •••"),
    ("see https://x.co/abc and www.foo.org", "see ••• and •••"), ("meet at gate 3 at 7:10", "meet at gate 3 at 7:10"),
    ("my insta is lina.jo", "my insta is •••"), ("room 12345", "room 12345")])
def test_chat_masks_numbers_and_links(text, shown):
    assert rides.mask(text) == shown


def test_chat(api):
    h = login(api, LINA)
    ride = joined(api, h)
    first = get(api, h, ride)["chat"]
    assert first[0]["who"] is None and "joined" in first[0]["text"] and first[1]["who"] == "Rania"
    r = post(api, h, ride, "chat", text="Hi! I'm near the bakery, 0791234567", after=first[-1]["seq"]).json()
    assert [m["text"] for m in r["chat"]] == ["Hi! I'm near the bakery, •••"] and r["chat"][0]["who"] == "Lina"
    assert post(api, h, ride, "chat", text="x" * (c.CHAT_MAX_CHARS + 1)).status_code == 422
    assert post(api, h, ride, "chat", text="   ").status_code == 422
    assert post(api, login(api, AHMAD), ride, "chat", text="hi").status_code == 404


# --- Tomorrow ---
def test_tomorrow_is_planned_and_reserved_apart_from_today(api):
    h = login(api, AHMAD)
    p = api.post("/api/plan", headers=h, json={"hood": "andalus", "lecture": "08:00"}).json()
    assert p["bus"]["ok_days"] >= c.PLAN_RELIABILITY * p["bus"]["days"] and p["bus"]["at_stop"] < p["ride"]["depart"]
    today = joined(api, h)
    assert p["ride"]["id"] != today["id"]
    # Tomorrow's seat can be taken at any hour today, and doesn't replace today's ride.
    assert post(api, h, p["ride"], "join", now="08:10").status_code == 200
    assert post(api, h, today, "leave").status_code == 200
    assert post(api, h, p["ride"], "leave", now="08:10").status_code == 200
    for hood in c.HOODS:
        for campus in c.CAMPUSES:
            assert api.post("/api/plan", headers=h, json={"hood": hood, "lecture": "08:00", "campus": campus}).status_code == 200


def test_static_files_are_revalidated(api):
    for path in ("/", "/app.js", "/i18n.js", "/style.css"):
        r = api.get(path)
        assert r.headers["cache-control"] == "no-cache"
        again = api.get(path, headers={"If-None-Match": r.headers["etag"]})
        assert again.status_code == 304


def test_map_key_comes_only_from_the_environment(api, monkeypatch):
    monkeypatch.setattr(c, "GOOGLE_MAPS_KEY", "")
    assert api.get("/api/map").json() == {"google_key": ""}
    monkeypatch.setattr(c, "GOOGLE_MAPS_KEY", "demo")
    assert api.get("/api/map").json() == {"google_key": "demo"}
