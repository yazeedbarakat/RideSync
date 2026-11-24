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

# --- Prices (JD) ---
BUS_FARE_JD = 0.60
TAXI_TO_STATION_JD = 1.50
SOLO_TAXI_TO_JUST_MIN_JD = 4.00
SOLO_TAXI_TO_JUST_MAX_JD = 5.00
SOLO_TAXI_TO_JUST_JD = 5.00  # default used for seat prices: 5.00 / 4 = 1.25

# --- Shared ride rules ---
MAX_RIDERS_PER_CAR = 4
MIN_RIDERS_PER_CAR = 3  # with 2 riders a seat (2.50) costs more than taxi + bus (2.10)
MAX_WALK_M = 500
ARRIVAL_WINDOW_MIN = 10
ARRIVAL_BUFFER_MIN = 10  # aim to arrive this long before the lecture
RIDE_SPEED_KMH = 36  # rush-hour average
ROAD_FACTOR = 1.3  # straight-line -> road distance
WALK_SPEED_M_PER_MIN = 80
MAX_EARLIER_MIN = 30  # if nobody fits the exact time, offer a car up to this much earlier
EARLIER_STEP_MIN = 5
SYNC_CAMPUSES = {"JUST"}  # pilot: no agreed fare for Yarmouk yet

# --- Buses ---
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
DEMO_NOW = os.getenv("DEMO_NOW", "07:05")  # simulated clock, "HH:MM"
DEFAULT_LECTURE = "08:00"
# The clock runs in each visitor's browser. It holds before the student joins, so the
# demo story (catch deadline 07:16, ride leaves 07:20) can't expire mid-pitch.
DEMO_HOLD_AFTER_MIN = 9  # pauses at 07:14
DEMO_RUN_MIN = 75  # stops at 08:20, after the demo bus arrives
DEMO_DOW = 1  # 0 = Sunday, so the demo day is a Monday
CLOCK_MIN_PER_SEC = 0.1  # simulated minutes per real second
CLOCK_MIN_PER_SEC_JOINED = 2.0

UNIVERSITY_DOMAINS = {
    "just.edu.jo": "JUST",
    "yu.edu.jo": "Yarmouk University",
    "aabu.edu.jo": "Al al-Bayt University",
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
    """Visitor's simulated time; never earlier than the snapshot the model predicted from."""
    start = hhmm_to_min(DEMO_NOW)
    return max(start, hhmm_to_min(now)) if now else start


def min_to_hhmm(m: float) -> str:
    m = int(round(m)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def seat_price(riders: int) -> float:
    return round(SOLO_TAXI_TO_JUST_JD / riders, 2)


def price_comparison(riders: int = MAX_RIDERS_PER_CAR) -> dict:
    seat = seat_price(riders)
    taxi_bus = round(BUS_FARE_JD + TAXI_TO_STATION_JD, 2)
    return {
        "riders": riders,
        "bus": BUS_FARE_JD,
        "taxi_plus_bus": taxi_bus,
        "ridesync": seat,
        "ridesync_max": seat_price(MIN_RIDERS_PER_CAR),
        "solo_taxi": SOLO_TAXI_TO_JUST_JD,
        "solo_taxi_min": SOLO_TAXI_TO_JUST_MIN_JD,
        "solo_taxi_max": SOLO_TAXI_TO_JUST_MAX_JD,
        "saved_vs_taxi_plus_bus": round(taxi_bus - seat, 2),
        "saved_vs_solo_taxi": round(SOLO_TAXI_TO_JUST_JD - seat, 2),
    }
