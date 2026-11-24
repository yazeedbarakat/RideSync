"""Arrival range, bus reports, drop-outs, family link and tomorrow's plan."""
import pytest
from fastapi.testclient import TestClient

from app import config as c
from app import matching
from app.main import app

from .test_demo import login, match

AHMAD, LINA = "ahmad@cit.just.edu.jo", "lina@cit.just.edu.jo"


@pytest.fixture(scope="module")
def api():
    with TestClient(app) as client:
        yield client


def late(api, lecture="08:00", headers=None, **kw):
    return api.get("/api/late-check", params={"hood": "andalus", "lecture": lecture, **kw}, headers=headers or {}).json()


def joined(api, h, **kw):
    ride = match(api, h, **kw).json()["ride"]
    assert api.post(f"/api/rides/{ride['id']}/join", headers=h, json={}).status_code == 200
    return ride


def post(api, h, ride, action, **body):
    return api.post(f"/api/rides/{ride['id']}/{action}", headers=h, json=body)


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


# --- Leaving and drop-outs ---
def test_dropouts_refill_then_reprice_then_cancel(api):
    h = login(api, AHMAD)
    ride = joined(api, h)
    seen, prices, gone = set(), [], 0
    while (r := post(api, h, ride, "dropout").json())["ride"]:
        new = r["ride"]
        assert (new["id"], new["depart"], new["arrive"], new["pickup"]) == (ride["id"], ride["depart"], ride["arrive"], ride["pickup"])
        assert new["seat_price"] == c.seat_price(new["riders"]) and new["riders"] >= c.MIN_RIDERS_PER_CAR
        assert bool(r["replacement"]) == (new["riders"] == c.MAX_RIDERS_PER_CAR)
        prices.append(new["seat_price"])
        gone += 1
        assert gone < 10
    assert prices[0] == 1.25 and prices[-1] == 1.67
    assert post(api, h, ride, "dropout").status_code == 404  # cancelled
    again = match(api, h).json()["ride"]
    assert again is None or again["id"] != ride["id"]


def test_women_only_car_is_refilled_with_women_only(api):
    h = login(api, LINA)
    ride = joined(api, h, women_only=True)
    while (r := post(api, h, ride, "dropout").json())["ride"]:
        assert r["ride"]["women_only"]


def test_replacement_keeps_every_rule():
    base = {"campus": "JUST", "lat": 32.55, "lon": 35.87, "women_only": 0, "gender": "M", "desired_arrival": 470}
    rest = [{**base, "id": 1}, {**base, "id": 2, "gender": "F"}]
    bad = [{**base, "id": 1}, {**base, "id": 3, "lat": 32.57}, {**base, "id": 4, "campus": "YU"}, {**base, "id": 5, "desired_arrival": 469},
           {**base, "id": 6, "desired_arrival": 481}, {**base, "id": 7, "gender": "F", "women_only": 1}]
    pick = lambda pool, now=430: matching.replacement(rest, pool, {"lat": 32.55, "lon": 35.87}, 470, 440, now)
    assert pick(bad) is None
    assert pick([*bad, {**base, "id": 8, "lat": 32.551}])["id"] == 8
    assert pick([{**base, "id": 8, "lat": 32.551}], now=439.9) is None  # can't walk there in time


def test_leave(api):
    h = login(api, AHMAD)
    ride = match(api, h).json()["ride"]
    assert post(api, h, ride, "leave").status_code == 404  # not joined yet
    joined(api, h)
    assert post(api, h, ride, "leave", now="07:20").status_code == 409
    assert post(api, h, ride, "leave").status_code == 200
    joined(api, h)  # can come back


def test_earlier_car_is_offered_only_when_nothing_fits(api):
    pool = [{"id": i, "gender": "M", "women_only": 0, "lat": 32.55, "lon": 35.87, "campus": "JUST", "desired_arrival": 450} for i in range(1, 4)]
    me = {**pool[0], "id": 0}
    assert matching.find({**me, "desired_arrival": 455}, pool, 400)[1] == 0
    m, earlier = matching.find({**me, "desired_arrival": 470}, pool, 400)
    assert earlier == 10 and m["arrive"] == 450
    assert matching.find({**me, "desired_arrival": 500}, pool, 400)[0] is None


# --- Family link ---
def test_family_link_shows_one_rider_and_stops(api):
    h, other = login(api, AHMAD), login(api, LINA)
    ride = match(api, h).json()["ride"]
    assert post(api, h, ride, "share", now=430).status_code == 404  # not joined
    joined(api, h)
    assert post(api, other, ride, "share", now=430).status_code == 404
    token = post(api, h, ride, "share", now=430).json()["token"]
    assert post(api, h, ride, "share", now=435.5).json()["token"] == token
    r = api.get(f"/api/trips/{token}")
    assert (r.json()["name"], r.json()["now"]) == ("Ahmad", 435.5)
    assert not any(o["name"] in r.text for o in ride["others"]) and "seat_price" not in r.json()
    assert api.get("/api/trips/wrong").status_code == 404
    post(api, h, ride, "unshare")
    assert api.get(f"/api/trips/{token}").status_code == 404
    token = post(api, h, ride, "share", now=430).json()["token"]
    post(api, h, ride, "leave")
    assert api.get(f"/api/trips/{token}").status_code == 404


def test_family_link_keeps_moving_if_the_riders_phone_sleeps(api, monkeypatch):
    h = login(api, AHMAD)
    ride = joined(api, h)
    token = post(api, h, ride, "share", now=440, speed=2).json()["token"]
    import app.main as m
    real = m.time.time
    monkeypatch.setattr(m.time, "time", lambda: real() + 10)
    assert 460 <= api.get(f"/api/trips/{token}").json()["now"] < 461
    monkeypatch.setattr(m.time, "time", lambda: real() + 9999)
    assert api.get(f"/api/trips/{token}").json()["now"] == c.hhmm_to_min(c.DEMO_NOW) + c.DEMO_RUN_MIN


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
    assert post(api, h, p["ride"], "share", now=430).status_code == 404
    for hood in c.HOODS:
        for campus in c.CAMPUSES:
            assert api.post("/api/plan", headers=h, json={"hood": hood, "lecture": "08:00", "campus": campus}).status_code == 200
