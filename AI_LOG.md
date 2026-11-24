# AI log

How AI tools helped. Add a line per session: what we asked, what we kept, what we changed.

| Date | Tool | What it did | What we checked or decided |
|---|---|---|---|
| 2026-11-24 | Claude Code | Reviewed the spec; found the seat price didn't match the default fare, and that 2-rider cars cost more than taxi + bus | Recommendations accepted: 5.00 JD default fare, minimum 3 riders, JUST-only pilot |
| 2026-11-24 | Claude Code | Checked campus and station coordinates against OpenStreetMap, fetched road geometry from OSRM | Still to check locally: which lines actually stop where |
| 2026-11-24 | Claude Code | Wrote the seeded generator, prediction model, matching, API, mobile UI and tests | Model compared with a baseline on 3 held-out simulated days; matching rules tested on random pools |
| 2026-11-24 | Claude Code | Searched live-bus starting states to fit the demo story | Rejected states not seen in the history, so the demo says 91% full rather than 94% |
| 2026-11-24 | Claude Code | Made buses move along the predicted trajectory with a per-visitor demo clock | Holds at 07:14 so the story cannot expire mid-pitch; checked start, hold, join, arrival and restart in a browser |
| 2026-11-24 | Claude Code | Redesigned the UI: deadline timeline, ticket-style rides, map markers, opening screen, laptop layout | Checked every state in a browser at 320, 390 and 1366 px |
| 2026-11-24 | Claude Code | Added the arrival range and late risk, rider bus reports, drop-out handling, family link, tomorrow plan, Arabic | Range checked on held-out days (79% inside an 80% range); every screen clicked through in a browser at 320, 390 and 1366 px. Arabic still needs a native read |
| 2026-11-24 | Claude Code | Impact script comparing one-at-a-time matching with planning all cars together | 51% vs. 62% seated, simulated only; kept offline, not in the app |
| 2026-11-24 | Claude Code | Caught its own planner suggesting a 10-minute taxi to Sarih, and a family link that froze when the rider's tab was hidden | Both fixed |
