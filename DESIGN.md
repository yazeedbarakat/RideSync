# DESIGN.md — RideSync

How RideSync looks, reads and behaves, and how the parts fit together. This file describes what is built in
`static/` and `app/` today. If the code and this file disagree, the code wins: fix this file.

RideSync is a student concept for the Jeeny Next Stop hackathon. It is **not the official Jeeny app**, and that
note stays on the splash, login and About pages.

---

## 1. Design principles

1. **Feels like Jeeny.** Riders should feel at home: same home screen, menu, pickup map and account. Sync is one
   new tile in that app, not a separate product.
2. **Price first, no surprises.** Before joining, the rider sees their share, the full fare and the solo price.
   After joining they see one number, what they saved. Prices always come from the server (`app/config.py`),
   never from UI code.
3. **Safe by default.** Every car is one gender, always, with no toggle. The ride card says so in plain words
   ("Men only: every rider in this car is a man"). Phone numbers and links in chat are hidden.
4. **One thing per screen.** Each ride state has one title, one short subtitle and one main button.
5. **Honest demo.** The clock is simulated, the data is synthetic, and the demo menu is marked "Not part of the
   app". Never imply a live Jeeny connection.
6. **Works on a judge's phone.** Mobile first, one hand, thumb-reach buttons at the bottom, no install.

---

## 2. Visual language

### 2.1 Colour

Two token sets live in `static/style.css`. The **app tokens** (`:root`) are used by the Jeeny-style shell and
booking. The **ride tokens** (`.ns`) were ported from NextStop for the ride screen and chat. Both share the same
pink accent.

**App tokens (`:root`)**

| Token | Value | Use |
|---|---|---|
| `--pink` | `#EE018D` | Brand, primary buttons, Sync tile outline, focus ring |
| `--pink-ink` | `#c90077` | Pink text on light pink (ghost buttons, banner chips) |
| `--pink-soft` | `#fef3f9` | Tiles, ghost buttons, ready-check box |
| `--purple` | `#5B2384` | Second brand colour, stop numbers, destination pin |
| `--deep` | `#34104f` | Dark purple text on pink-soft, desktop frame shadow |
| `--lilac` / `--lilac-2` | `#f3f3f6` / `#d3d5dd` | Tags, driver card / outline-button borders |
| `--ink` | `#1d1f26` | Body text |
| `--muted` | `#676b76` | Secondary text, notes |
| `--line` | `#e6e7ec` | Dividers, square-button borders |
| `--bg` / `--card` | `#f6f7f9` / `#fff` | Page / card surfaces |
| `--ok` / `--ok-soft` | `#0f7a4d` / `#e2f4ea` | Good-news alerts, "Ready ✓" |
| `--warn` | `#a65a00` (on `#fdf0de`) | Warning alerts |
| `--bad` / `--bad-soft` | `#c01734` / `#fdeaed` | Errors, bad-news alerts |

**Ride tokens (`.ns`, ride screen and chat)**

| Token | Value |
|---|---|
| `--gray-25 … --gray-900` | `#F7F8FA` `#F1F2F5` `#ECEDF0` `#E4E6EA` `#D3D5DA` `#8A8F98` `#4A4F57` `#1C1E21` |
| `--accent` / `--accent-soft` | `var(--pink)` / `#FDEEF6` |
| `--success` / `--success-50` | `#1E9E4F` / `#E8F9EC` |
| `--danger` | `#E5393B` |
| `--amber-500` | `#F5A623` |
| `--cash-green` | `#22A447` |

Rules:
- Pink is for the one main action and the brand. Don't use it for decoration next to a primary button.
- Status colour always comes with words ("Ready ✓", "Zaid left late…"). Never rely on colour alone.
- The app is light mode only (`color-scheme: light`).

### 2.2 Type

- **Poppins** 400/500/600/700, vendored in `static/vendor/`. **Inter** is the fallback, then `system-ui`.
- Base: 15 px / 1.45. Numbers that line up (prices, times) use `font-variant-numeric: tabular-nums`.

| Role | Size / line height | Weight |
|---|---|---|
| Display (big price, time) | 32 / 40 | 700 |
| H1 (state title) | 22 / 30 | 600 |
| H2 | 20 / 28 | 600 |
| Button | 17 | 600 (secondary 500) |
| Body large / body | 16 / 24, 15 / 22 | 400–500 |
| Small, notes, tags | 13 / 18 | 500 |

### 2.3 Shape, space, depth

- **Radius:** 14 px buttons, 16 px cards and square icon buttons, 20 px tiles, 24 px bottom sheets (top
  corners), 999 px chips and pills, 50% avatars.
- **Spacing:** 4-px steps; most gaps are 8, 10, 12 or 14 px. Screen side padding is 16–20 px (`--pad: 20px`
  on the ride screen).
- **Shadows:** `--shadow` (`0 1px 3px #1d1f2614`) for cards and floating buttons; `--shadow-sheet`
  (`0 -4px 16px rgba(0,0,0,.08)`) for bottom sheets; the primary button gets a soft pink glow.
- **Touch targets:** at least 44 px (icon buttons 44–48 px, primary buttons 52–54 px).

### 2.4 Icons and art

- One inline SVG sprite in `static/index.html` (`#i-car`, `#i-chat`, `#i-shield`, …), used with
  `<svg class="i"><use href="#i-…"/></svg>`. 20 px by default, 24 px in the ride screen.
- Rider avatars are initials in a circle or rounded square (A, Y, O, Z). Never use real photos or real people's
  details from screenshots.

### 2.5 Money and time

- Prices: `JOD 1.75`, always two decimals, from `money()` in `static/i18n.js`.
- Times: 24-hour (`07:15`) on the booking card and driver offer, 12-hour (`7:15 AM`) on the ride screen and
  demo clock.

---

## 3. Components

| Component | Class | Notes |
|---|---|---|
| Primary button | `.primary`, `.ns .btn` | Full width, pink, one per screen, at the bottom |
| Ghost button | `.ghost` | Pink text on pink-soft, second action |
| Outline / secondary button | `.outline`, `.btn-secondary` | White with grey border |
| Danger text button | `.btn-danger` | "Leave ride", "Cancel ride for me" |
| Square icon button | `.sq`, `.ns .icon-btn` | Back, menu, bell; `.dotted` adds an unread dot |
| Home tile | `.tile`, `.tile.sync` | Sync has a 2 px pink inset border and an `em` badge |
| Alert | `.alert` (`.bad`, `.warn`) | One line of bold text plus a small line |
| Chip | `.chip` | Floating clock / label on the map |
| Demo chip | `.demo-chip` | Dark translucent pill, top right; opens the demo menu |
| Tag | `.tag` | Small grey label with tabular numbers |
| Banner / discovery card | `.banner`, `.disc` | Horizontal snap-scroll promos on the home screen |
| Bottom sheet | `.sheet-host > .scrim + .sheet` | Slides up (`nsup`), scrim fades; used for the ready check, leaving and the demo menu |
| Ready box | `.ready` | Countdown and who is ready |
| Driver card | `.driver` | Avatar, name, car and plate |
| Stop row | `.stop` | Purple numbered circle, label, small text |
| Seat row | `seatRow()` in `app.js` | One initial per rider, empty seats shown |

---

## 4. Screens and flow

Screens are sections in `static/index.html`. `show()` / `go()` in `static/shell.js` switch them, with a
back stack.

```
splash → login (Sign up: name + gender | demo: Ahmad, Lina)
       → launch (home: Ride, Sync, menu, banners)
            ├─ where → pickup                (normal ride, Jeeny style)
            └─ home  (Sync booking sheet: From, To, Arrive by)
                   → Sync a ride → match card → Join
                   → ridescreen (map + status sheet) ⇄ chatscreen
                   → summary
       page (menu pages: account, how matching works, about)
```

### 4.1 Booking (Sync sheet)
- Fields: **From** (Irbid neighbourhood), **To** (JUST; Yarmouk is listed but shared rides are JUST-only),
  **Arrive by**.
- The button carries the price before tapping: "Sync a ride, about JOD 1.75 each".
- "Tomorrow" card below offers to reserve the same seat for the next day.

### 4.2 Match card
- Ticket header: "3 riders going your way", pickup time → arrival time.
- Riders by first name, meeting point with walking distance, same-gender line with a shield icon.
- Big share price, then "One fare of JOD 6.87 split by 4" and "Riding alone would cost JOD 6.90", plus the
  leaving rule in one sentence.
- Button: "Join for JOD 1.75". No approval step: joining is instant.

### 4.3 Ride screen
Map on top (36% of the screen height), status sheet below with a progress bar, seat row, chat preview, pickup
and destination, booking details and the action area.

| State (`app/rides.py`) | Title | Subtitle | Main action |
|---|---|---|---|
| `OPEN` | Waiting for riders | n of 4 seats filled | Find driver (or "Starts automatically at …") |
| `READY_CHECK` | Ready check | n of 4 ready · m:ss left | Sheet: I'm ready / Cancel ride for me |
| `DISPATCHED` | Finding your driver | Your ride is set | none, pulse on the map |
| `ACCEPTED`, `IN_PROGRESS` | Driver on the way | Driver · car · plate | Leave ride (danger text, until the trip starts) |
| `COMPLETED` | You've arrived (summary) | To JUST · arrived 7:48 AM | Done |
| `CANCELED` | Ride canceled (summary) | | Done |
| (you left) | You left this ride (summary) | | Done |

Rules shown in the UI:
- The ready check starts on its own 45 min before pickup; no answer within 5 min counts as ready.
- Leaving is free until a driver accepts, and until 30 min before pickup after that. A late leaver pays their own
  share as a credit on the ride, so the others' shares don't change.

### 4.4 Group chat
- Opens on join with a system line and two hello messages.
- Phone numbers and links are replaced with `•••` on the server before they're stored.
- Read-only after the ride completes or is canceled. Messages are capped at 300 characters.

### 4.5 Trip summary
"You paid", savings vs riding solo, riders who shared, and the driver's side: cash from riders + credit from
Jeeny = total (e.g. 5.25 + 1.75 = 7.00).

### 4.6 Driver's app (demo)
Plain list: first pickup, riders, full fare, cash to collect, trip distance and time, respond by. "Accept as
Mahmoud" and "Reject". Reached only through the demo menu.

### 4.7 Demo menu
Bottom sheet from the demo chip, headed "Simulated clock … Not part of the app." It only shows actions that make
sense in the current state: Open the driver's app, Skip to the late-leave window, *name* leaves, Play the trip,
Complete trip, Restart the demo.

---

## 5. Writing style

- Short, plain English sentences. Say what happens and what it costs.
- Use "you" for the rider and first names for others ("Zaid left late and pays their own share").
- Use they/them for riders in system messages.
- Don't say "AI" about matching; it is rules-based.
- Don't claim Jeeny coverage in Irbid, LTRC approval of fare splitting, or a real driver.
- Buttons say what they do: "Join for JOD 1.75", "Find driver", "I'm ready".

---

## 6. Accessibility and motion

- Visible focus ring: 3 px pink outline, 2 px offset (`:focus-visible`).
- Icon-only buttons have `aria-label`; the home alert uses `aria-live="polite"`.
- `prefers-reduced-motion: reduce` turns off all animations and transitions.
- Contrast: body text `#1d1f26` on white; muted text is kept for secondary information only.
- Respect the safe area: floating controls use `env(safe-area-inset-top/bottom)`.

---

## 7. Layout and devices

- Phone first: the app fills the viewport (`100dvh`).
- From 700 px wide, the app sits in a 420 px phone frame (rounded 34 px, pink-to-lilac background) so it still
  looks like a phone on a laptop.
- Maps: Google map tiles when `GOOGLE_MAPS_KEY` is set, otherwise OpenStreetMap through Leaflet
  (`static/map.js`). The pickup is a pink pin, the campus a purple label.

---

## 8. System design

```
Browser (static/, plain JS, no build)
  shell.js  Jeeny-style app: screens, menu, pickup
  app.js    Sync: booking, match, ride screen, chat, driver's app, demo menu
  map.js    Google / OSM map        i18n.js  t(), money()
        │  JSON over HTTP, header X-Session
        ▼
FastAPI (app/main.py) ── serves static/ and /api/*
  matching.py  same gender, destination, ±10 min arrival, ≤500 m walk, 3–4 riders
  fare.py      LTRC smart-app tariff + traffic curve → one fare, shares rounded up to 0.05
  rides.py     state machine, ready check, simulated driver, leaving, chat masking, summary
  predict.py   bus arrival/crowding model (backend only, not shown in the app)
  config.py    every price, rule and demo setting
        │
        ▼
SQLite (data/ridesync.db), rebuilt by scripts/generate_data.py (seed 1337)
```

Key decisions:
- **One process, one command.** FastAPI serves both API and frontend; `./run.sh` or `docker compose up`.
- **Per-visitor sessions.** Each login gets its own session, rides, chat and clock, so judges never affect each
  other.
- **Server owns prices and rules.** The UI only formats what the API returns.
- **Simulated clock.** Starts at 06:10, runs at 6x, holds at 06:15 until a driver accepts; the client passes
  `now` so the server applies time-based rules consistently.
- **Deterministic data.** Seeded generators keep the demo identical on every run; tests cover the demo numbers.

### Main endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/login` | Demo login or name + gender signup |
| GET | `/api/config`, `/api/price`, `/api/solo` | Rules and prices for the UI |
| POST | `/api/rides/match` | Find a car for From / To / Arrive by |
| POST | `/api/rides/{id}/join` | Join (closes 45 min before pickup) |
| GET | `/api/rides/{id}` | Ride, state and chat |
| POST | `/api/rides/{id}/find-driver`, `/ready` | Start / answer the ready check |
| GET/POST | `/api/rides/{id}/offer`, `/driver` | Driver's offer, accept or reject |
| POST | `/api/rides/{id}/leave`, `/dropout` | You leave / a simulated rider leaves |
| POST | `/api/rides/{id}/chat` | Send a masked chat message |
| POST | `/api/rides/{id}/complete`, `/api/demo/reset` | Finish trip / restart demo |

---

## 9. Known design debt

- Two token sets (`:root` and `.ns`) with near-duplicate greys and greens. Merge them after the hackathon.
- Leftover right-to-left (Arabic) rules in `style.css` are unused since Arabic was removed.
- After joining, "Waiting for riders" shows even when all 4 seats are filled.
- Phone numbers spelled out in words are not masked in chat.
- When changing JS or CSS, bump `?v=` in `static/index.html` so phones don't keep stale files.
