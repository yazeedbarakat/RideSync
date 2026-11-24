"""The 3-minute demo script and the rules that must never break."""
import itertools
import random

import pytest
from fastapi.testclient import TestClient

from app import config as c
from app import matching
from app.main import app


@pytest.fixture(scope="session")
def api():
    with TestClient(app) as client:
        yield client


def login(api, email):
    return {"X-Session": api.post("/api/verify", json={"email": email}).json()["session"]}


def match(api, h, **kw):
    return api.post("/api/rides/match", headers=h, json={"hood": "andalus", "lecture": "08:00", **kw})


def test_prices():
    p = c.price_comparison()
    assert (p["bus"], p["taxi_plus_bus"], p["ridesync"], p["solo_taxi"]) == (0.60, 2.10, 1.25, 5.00)
    assert p["ridesync_max"] < p["taxi_plus_bus"]  # sharing must still win at the minimum group size


def test_demo_story(api):
    r = api.get("/api/late-check", params={"hood": "andalus", "lecture": "08:00"}).json()
    assert r["bus"]["arrival"] == "08:14" and r["late_min"] == 14 and r["suggest_sync"]
    assert r["bus"]["board"]["occupancy_pct"] == 91
    h = login(api, "ahmad@cit.just.edu.jo")
    ride = match(api, h).json()["ride"]
    assert (ride["riders"], ride["depart"], ride["arrive"], ride["seat_price"]) == (4, "07:20", "07:48", 1.25)
    j = api.post(f"/api/rides/{ride['id']}/join", headers=h, json={}).json()
    assert j["status"] == "confirmed" and j["ride"]["prices"]["saved_vs_taxi_plus_bus"] == 0.85


def test_women_only(api):
    h = login(api, "lina@cit.just.edu.jo")
    ride = match(api, h, women_only=True).json()["ride"]
    assert ride["women_only"] and ride["riders"] == 4
    for email in ("ahmad@cit.just.edu.jo", "someone@ses.yu.edu.jo"):
        assert match(api, login(api, email), women_only=True).status_code == 403


def test_matches_obey_every_constraint():
    rng = random.Random(1)
    for _ in range(40):
        pool = [{"id": i, "gender": (g := rng.choice("FM")), "women_only": int(g == "F" and rng.random() < .4),
                 "lat": 32.55 + rng.gauss(0, .004), "lon": 35.87 + rng.gauss(0, .004), "campus": rng.choice(["JUST", "YU"]),
                 "desired_arrival": rng.randint(455, 485), "first_name": "x", "hood": "andalus"} for i in range(40)]
        for me in pool[:6]:
            got = matching.best_group(me, [s for s in pool if s is not me], 400)
            if not got:
                continue
            g = got["group"]
            assert c.MIN_RIDERS_PER_CAR <= len(g) <= c.MAX_RIDERS_PER_CAR and len({r["id"] for r in g}) == len(g)
            assert max(matching.walk_m(r, got["pickup"]) for r in g) <= c.MAX_WALK_M
            for a, b in itertools.combinations(g, 2):
                assert a["campus"] == b["campus"]
                assert abs(a["desired_arrival"] - b["desired_arrival"]) <= c.ARRIVAL_WINDOW_MIN
                assert not (a["women_only"] and b["gender"] != "F") and not (b["women_only"] and a["gender"] != "F")


@pytest.mark.parametrize("email,ok", [
    ("a@just.edu.jo", True), ("a@ses.yu.edu.jo", True), ("a@st.aabu.edu.jo", True),
    ("a@gmail.com", False), ("a@notjust.edu.jo", False), ("a@just.edu.jo.evil.com", False), ("nope", False)])
def test_verification(api, email, ok):
    assert (api.post("/api/verify", json={"email": email}).status_code == 200) is ok


def test_visitors_are_isolated(api):
    a, b = login(api, "ahmad@cit.just.edu.jo"), login(api, "lina@cit.just.edu.jo")
    ride = match(api, a).json()["ride"]
    assert api.post(f"/api/rides/{ride['id']}/join", headers=b, json={}).status_code == 404
    assert match(api, {}).status_code == 401


def test_no_student_locations_leak(api):
    ride = match(api, login(api, "ahmad@cit.just.edu.jo")).json()["ride"]
    assert all(set(o) == {"name"} for o in ride["others"])


def test_bad_input_and_edges(api):
    assert api.get("/api/late-check", params={"hood": "andalus", "lecture": "99:99"}).status_code == 422
    assert api.get("/api/late-check", params={"hood": "mars", "lecture": "08:00"}).status_code == 422
    assert api.get("/api/buses/predictions", params={"route": "R9"}).status_code == 404
    h = login(api, "ahmad@cit.just.edu.jo")
    assert match(api, h, lecture="07:10").json()["ride"] is None
    assert match(api, h, campus="YU").status_code == 422
    for hood in c.HOODS:
        for campus in c.CAMPUSES:
            assert api.get("/api/late-check", params={"hood": hood, "lecture": "09:00", "campus": campus}).status_code == 200


def test_model_beats_baseline(api):
    m = api.get("/api/model").json()
    for k in ("arrival_mae_min", "crowding_mae"):
        assert m[k]["model"] < m[k]["baseline"]


HOLD = c.min_to_hhmm(c.hhmm_to_min(c.DEMO_NOW) + c.DEMO_HOLD_AFTER_MIN)


def test_story_is_unchanged_when_the_clock_holds(api):
    q = {"hood": "andalus", "lecture": "08:00"}
    start, hold = (api.get("/api/late-check", params={**q, "now": n}).json() for n in (c.DEMO_NOW, HOLD))
    for k in ("late_min", "full", "past", "suggest_sync"):
        assert start[k] == hold[k]
    assert (hold["bus"]["id"], hold["bus"]["arrival"]) == ("B2", "08:14")
    h = login(api, "ahmad@cit.just.edu.jo")
    assert match(api, h).json() == match(api, h, now=HOLD).json()


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


def test_cannot_join_after_departure(api):
    h = login(api, "ahmad@cit.just.edu.jo")
    url = f"/api/rides/{match(api, h).json()['ride']['id']}/join"
    assert api.post(url, headers=h, json={"now": "07:20"}).status_code == 409
    assert api.post(url, headers=h, json={"now": "07:19"}).status_code == 200
    assert api.get("/api/buses/predictions", params={"now": "25:00"}).status_code == 422
