"""The demo script and the rules that must never break."""
import itertools
import random

import pytest
from fastapi.testclient import TestClient

from app import config as c
from app import fare, matching
from app.main import app


@pytest.fixture(scope="session")
def api():
    with TestClient(app) as client:
        yield client


def login(api, who):
    return {"X-Session": api.post("/api/login", json={"demo": who}).json()["session"]}


def match(api, h, **kw):
    return api.post("/api/rides/match", headers=h, json={"hood": "andalus", "lecture": "08:00", **kw})


# NextStop SPEC v5 §4.7: solo Irbid City Center -> JUST on a Sunday (fixed table: 7.8 km urban + 11.5 highway).
@pytest.mark.parametrize("arrive,pickup,minutes,fare_jd,rounded", [
    ("03:00", "02:28", 27, 8.26, 8.30), ("07:30", "06:48", 37, 7.60, 7.60), ("08:00", "07:15", 40, 7.81, 7.85),
    ("11:00", "10:21", 34, 7.43, 7.45), ("15:00", "14:17", 38, 7.70, 7.70), ("22:00", "21:26", 29, 7.16, 7.20)])
def test_fare_matches_the_nextstop_golden_values(arrive, pickup, minutes, fare_jd, rounded):
    p = fare.plan((7.8, 11.5), c.hhmm_to_min(arrive) - 5, dow=0)
    assert (c.min_to_hhmm(p["pickup"]), round(p["minutes"]), p["km"], p["fare"], fare.up05(p["fare"])) == \
        (pickup, minutes, 19.3, fare_jd, rounded)


def test_shares_round_up_and_never_undercharge():
    assert fare.up05(1.70) == 1.70 and fare.up05(1.7001) == 1.75 and fare.up05(6.87 / 4) == 1.75
    for f in (5.0, 6.79, 6.87, 7.81, 9.03):
        for n in range(1, 5):
            assert 0 <= fare.share(f, n) * n - f < 0.05 * n


def test_demo_story(api):
    assert api.get("/api/price", params={"hood": "andalus", "lecture": "08:00"}).json() == {"from": 1.75}
    ride = match(api, login(api, "ahmad")).json()["ride"]
    assert (ride["riders"], ride["depart"], ride["arrive"], ride["share"], ride["fare"], ride["solo"]) == \
        (4, "07:15", "07:48", 1.75, 6.87, 6.90)
    assert ride["saved"] == 5.15 and ride["state"] == "offered"
    lina = match(api, login(api, "lina")).json()["ride"]
    assert (lina["riders"], lina["share"], lina["depart"]) == (4, 1.70, "07:16")
    assert {o["name"] for o in lina["others"]} == {"Rania", "Dana", "Tala"}


def test_bus_model_story_is_unchanged(api):
    r = api.get("/api/late-check", params={"hood": "andalus", "lecture": "08:00"}).json()
    assert r["bus"]["arrival"] == "08:14" and r["late_min"] == 14 and r["bus"]["board"]["occupancy_pct"] == 91


def test_matches_obey_every_constraint():
    rng = random.Random(1)
    for _ in range(40):
        pool = [{"id": i, "gender": rng.choice("FM"), "lat": 32.55 + rng.gauss(0, .004), "lon": 35.87 + rng.gauss(0, .004),
                 "campus": rng.choice(["JUST", "YU"]), "desired_arrival": rng.randint(455, 485), "first_name": "x", "hood": "andalus"}
                for i in range(40)]
        for me in pool[:6]:
            got = matching.best_group(me, [s for s in pool if s is not me], 370)
            if not got:
                continue
            g = got["group"]
            assert c.MIN_RIDERS_PER_CAR <= len(g) <= c.MAX_RIDERS_PER_CAR and len({r["id"] for r in g}) == len(g)
            assert max(matching.walk_m(r, got["pickup"]) for r in g) <= c.MAX_WALK_M
            assert got["depart"] >= 370 + c.JOIN_LEAD_MIN and got["arrive"] <= min(r["desired_arrival"] for r in g)
            for a, b in itertools.combinations(g, 2):
                assert a["campus"] == b["campus"] and a["gender"] == b["gender"]
                assert abs(a["desired_arrival"] - b["desired_arrival"]) <= c.ARRIVAL_WINDOW_MIN


def test_login(api):
    assert api.post("/api/login", json={"demo": "lina"}).json()["profile"]["gender"] == "F"
    r = api.post("/api/login", json={"first_name": "Noor", "gender": "F"})
    assert r.status_code == 200 and r.json()["profile"]["first_name"] == "Noor"
    for body in ({"first_name": "Noor"}, {"gender": "M"}, {"first_name": " ", "gender": "M"}, {"demo": "omar"}, {"first_name": "x", "gender": "X"}):
        assert api.post("/api/login", json=body).status_code == 422


def test_visitors_are_isolated(api):
    a, b = login(api, "ahmad"), login(api, "lina")
    ride = match(api, a).json()["ride"]
    assert api.post(f"/api/rides/{ride['id']}/join", headers=b, json={}).status_code == 404
    assert match(api, {}).status_code == 401


def test_no_rider_locations_leak(api):
    ride = match(api, login(api, "ahmad")).json()["ride"]
    assert all(set(o) == {"name", "ready"} for o in ride["others"])


def test_bad_input_and_edges(api):
    assert api.get("/api/late-check", params={"hood": "andalus", "lecture": "99:99"}).status_code == 422
    assert api.get("/api/late-check", params={"hood": "mars", "lecture": "08:00"}).status_code == 422
    assert api.get("/api/buses/predictions", params={"route": "R9"}).status_code == 404
    assert api.get("/api/price", params={"hood": "andalus", "lecture": "08:00", "campus": "YU"}).status_code == 422
    h = login(api, "ahmad")
    assert match(api, h, lecture="06:40").json()["ride"] is None  # pickup would be under 45 min away
    assert match(api, h, campus="YU").status_code == 422
    for hood in c.HOODS:
        assert api.get("/api/price", params={"hood": hood, "lecture": "09:00"}).status_code == 200
        for campus in c.CAMPUSES:
            assert api.get("/api/late-check", params={"hood": hood, "lecture": "09:00", "campus": campus}).status_code == 200


def test_model_beats_baseline(api):
    m = api.get("/api/model").json()
    for k in ("arrival_mae_min", "crowding_mae"):
        assert m[k]["model"] < m[k]["baseline"]


def test_story_is_unchanged_when_the_clock_holds(api):
    h = login(api, "ahmad")
    hold = c.min_to_hhmm(c.hhmm_to_min(c.DEMO_NOW) + c.DEMO_HOLD_AFTER_MIN)
    assert match(api, h).json() == match(api, h, now=hold).json()


def test_buses_move_along_their_predicted_route(api):
    def at(now):
        return {b["id"]: b for b in api.get("/api/buses/predictions", params={"now": now}).json()["buses"]}
    early, late = at("07:05"), at("08:20")
    assert (early["B1"]["lat"], early["B1"]["lon"]) != (at("07:10")["B1"]["lat"], at("07:10")["B1"]["lon"])
    assert early["B2"]["filling"] and not at("07:30")["B2"]["filling"]
    for b in late.values():
        end = c.CAMPUSES[b["campus"]]
        assert b["arrived"] and matching.haversine_m(b["lat"], b["lon"], end["lat"], end["lon"]) < 600
        minutes = [p[0] for p in b["track"]]
        assert minutes == sorted(minutes)
        assert all(matching.haversine_m(*p[1:], *q[1:]) < 1500 for p, q in zip(b["track"], b["track"][1:]))


def test_joining_closes_45_min_before_pickup(api):
    h = login(api, "ahmad")
    url = f"/api/rides/{match(api, h).json()['ride']['id']}/join"
    assert api.post(url, headers=h, json={"now": "06:31"}).status_code == 409
    assert api.post(url, headers=h, json={"now": "06:30"}).status_code == 200
    assert api.post(url, headers=h, json={"now": "06:30"}).status_code == 409  # already joined
    assert api.get("/api/buses/predictions", params={"now": "25:00"}).status_code == 422
