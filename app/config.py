"""Single source of truth for prices, rules and demo settings.

Never hard-code any of these elsewhere; the UI reads them from GET /api/config.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / "data"))
DB_PATH = DATA_DIR / "ridesync.db"
ROUTES_PATH = ROOT / "data" / "routes.json"
RIDE_PATHS_PATH = ROOT / "data" / "ride_paths.json"

GOOGLE_MAPS_KEY = os.getenv("GOOGLE_MAPS_KEY", "").strip()  # empty = OpenStreetMap

# --- Fare: LTRC smart-app tariff (yellow-taxi meter + 20%), effective 11 May 2026 ---
# One trip, one fare. The riders split that fare; we never sell per-seat fares.
# Ported from NextStop's docs/reference/fare_model.py (SPEC v5 §4).
TARIFF_DAY = {"flag": 0.468, "km": 0.336, "wait": 0.0576}    # waiting rate is our estimate
TARIFF_NIGHT = {"flag": 0.480, "km": 0.396, "wait": 0.0679}  # 00:00-06:00 (hours unconfirmed)
NIGHT_UNTIL_H = 6
MIN_FARE_JD = 1.00
CALIBRATION = 1.00  # Jeeny Economy quote / our formula, once a teammate has a real quote
DWELL_PICKUP_MIN, DWELL_DROP_MIN = 1.5, 0.5  # billed at the waiting rate
SHARE_STEP_JD = 0.05  # each share is rounded up to this; the driver keeps the remainder
# Road model: urban leg to the Irbid-Ramtha road exit, then highway to JUST
ROAD_EXIT = (32.5200, 35.8900)
CIRCUITY_URBAN, CIRCUITY_HIGHWAY = 1.35, 1.15  # straight-line -> road km
SPEED_URBAN_KMH, SPEED_HIGHWAY_KMH = 30.0, 70.0  # free flow
# Weekday congestion (hour, urban factor, highway factor); linear in between. Fri/Sat get half.
TRAFFIC = [(0, 1.00, 1.00), (5, 1.00, 1.00), (6, 1.15, 1.05), (7, 1.55, 1.20), (7.5, 1.75, 1.30), (8, 1.75, 1.30),
           (9, 1.40, 1.15), (11, 1.30, 1.10), (13, 1.45, 1.15), (14.5, 1.60, 1.20), (16, 1.50, 1.15),
           (18, 1.45, 1.15), (20, 1.20, 1.05), (22, 1.05, 1.00), (24, 1.00, 1.00)]
WEEKEND_DOW = {5, 6}  # 0 = Sunday

# --- Shared ride rules ---
MAX_RIDERS_PER_CAR = 4
MIN_RIDERS_PER_CAR = 3  # a car is formed from 3; after that it goes with whoever stays
MAX_WALK_M = 500
ARRIVAL_WINDOW_MIN = 10
ARRIVAL_BUFFER_MIN = 10  # aim to arrive this long before the arrive-by time
ROAD_FACTOR = 1.3  # straight-line -> walking distance
WALK_SPEED_M_PER_MIN = 80
MAX_EARLIER_MIN = 30  # if nobody fits the exact time, offer a car up to this much earlier
EARLIER_STEP_MIN = 5
SYNC_CAMPUSES = {"JUST"}  # pilot: JUST only
JOIN_LEAD_MIN = 45  # joining closes once pickup is less than this away
READY_CHECK_LEAD_MIN = 45  # the ready check starts by itself at pickup - 45 min
READY_CHECK_MIN = 5  # no answer after this = ready
SIM_READY_AFTER_S = (1.5, 2.5, 3.5)  # simulated riders answer Ready this many real seconds in
RESPOND_BY_LEAD_MIN = 15  # no driver by pickup - 15 min: ride cancelled, no fees
LATE_LEAVE_MIN = 30  # leaving after a driver accepted and < 30 min before pickup: you pay your share
CHAT_MAX_CHARS = 300
CHAT_HISTORY = 100
DRIVERS = [  # simulated drivers, offered in this order
    {"name": "Mahmoud", "car": "White Hyundai Elantra", "plate": "12-34567"},
    {"name": "Ibrahim", "car": "Silver Kia Cerato", "plate": "14-82910"},
]

# --- Buses (backend model only) ---
BUS_FARE_JD = 0.60
TAXI_TO_STATION_JD = 1.50
BUS_CAPACITY = 50
BUS_SLOWDOWN = 1.4  # bus time vs. free-flow car time
CROWD_ALMOST_FULL = 0.70
CROWD_FULL = 0.97
STOP_WALKABLE_M = 800  # beyond this a student needs a taxi to the stop
TAXI_TO_STOP_MIN = 10
QUANTILES = (0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95)  # arrival-time distribution
LATE_RISK = 0.30  # suggest a ride from this chance of being late, even if the best guess is on time
# What a rider's crowding report means for the model's occupancy input
REPORT_OCC = {"seats free": 0.45, "almost full": 0.85, "full": 1.0}
PLAN_RELIABILITY = 0.90  # "be there by" time that works on at least this share of past days
PLAN_LOOKBACK_MIN = 150
PLAN_STEP_MIN = 5

# --- Demo ---
SEED = 1337
DEMO_NOW = os.getenv("DEMO_NOW", "06:10")  # simulated clock, "HH:MM"
BUS_NOW = "07:05"  # the backend bus model's snapshot (not shown in the app)
DEFAULT_LECTURE = "08:00"
# The clock runs in each visitor's browser. It holds until a driver accepts, so joining,
# chat and the ready check can't run out of time mid-pitch. "Play the trip" then runs it fast.
DEMO_HOLD_AFTER_MIN = 5  # pauses at 06:15
DEMO_RUN_MIN = 110  # stops at 08:00, after the ride arrives
DEMO_DOW = 1  # 0 = Sunday, so the demo day is a Monday
CLOCK_MIN_PER_SEC = 0.1  # simulated minutes per real second
CLOCK_MIN_PER_SEC_JOINED = 2.0

# Seeded demo logins, so nobody signs up on stage. Gender is fixed at signup.
DEMO_ACCOUNTS = {
    "ahmad": {"first_name": "Ahmad", "gender": "M", "hood": "andalus", "lecture": "08:00"},
    "lina": {"first_name": "Lina", "gender": "F", "hood": "andalus", "lecture": "08:00"},
}

CAMPUSES = {
    "JUST": {"name": "JUST", "lat": 32.4934, "lon": 35.9899},
    "YU": {"name": "Yarmouk University", "lat": 32.5372, "lon": 35.8555},
}

# Irbid neighbourhoods (OpenStreetMap place nodes)
HOODS = {
    "andalus": ("Al-Andalus", 32.5554, 35.8747),
    "zahra": ("Al-Zahra", 32.5485, 35.8755),
    "rawda": ("Al-Rawda", 32.5592, 35.8681),
    "nuzha": ("Al-Nuzha", 32.5510, 35.8560),
    "midan": ("Al-Midan", 32.5585, 35.8559),
    "jami": ("Al-Jami", 32.5556, 35.8475),
    "tall": ("Al-Tall", 32.5597, 35.8472),
    "manara": ("Al-Manara", 32.5517, 35.8419),
    "afrah": ("Al-Afrah", 32.5345, 35.8490),
    "hikma": ("Al-Hikma", 32.5431, 35.8632),
    "wurud": ("Al-Wurud", 32.5420, 35.8778),
    "hanina": ("Hanina", 32.5792, 35.8583),
    "baqa": ("Al-Buqa", 32.5732, 35.8771),
    "hawwara": ("Hawwara", 32.5346, 35.8926),
}


def hhmm_to_min(s: str) -> int:
    h, m = s.split(":")
    h, m = int(h), int(m)
    if not (0 <= h < 24 and 0 <= m < 60):
        raise ValueError("time out of range")
    return h * 60 + m


def sim_now(now: str | None) -> int:
    """Visitor's simulated time; never earlier than the demo start."""
    start = hhmm_to_min(DEMO_NOW)
    return max(start, hhmm_to_min(now)) if now else start


def bus_now(now: str | None) -> int:
    """Bus model time; never earlier than the snapshot it predicted from."""
    start = hhmm_to_min(BUS_NOW)
    return max(start, hhmm_to_min(now)) if now else start


def min_to_hhmm(m: float) -> str:
    m = int(round(m)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"
