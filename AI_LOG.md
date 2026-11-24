# AI log

How AI tools helped. Add a line per session: what we asked, what we kept, what we changed.

| Date | Tool | What it did | What we checked or decided |
|---|---|---|---|
| 2026-11-24 | Claude Code | Reviewed the spec; found the seat price didn't match the default fare, and that 2-rider cars cost more than taxi + bus | Recommendations accepted: 5.00 JD default fare, minimum 3 riders, JUST-only pilot |
| 2026-11-24 | Claude Code | Checked campus and station coordinates against OpenStreetMap, fetched road geometry from OSRM | Still to check locally: which lines actually stop where |
| 2026-11-24 | Claude Code | Wrote the seeded generator, prediction model, matching, API, mobile UI and tests | Model compared with a baseline on 3 held-out simulated days; matching rules tested on random pools |
| 2026-11-24 | Claude Code | Searched live-bus starting states to fit the demo story | Rejected states not seen in the history, so the demo says 91% full rather than 94% |
| 2026-11-24 | Claude Code | Made buses move along the predicted trajectory with a per-visitor demo clock | Holds at 07:14 so the story cannot expire mid-pitch; checked start, hold, join, arrival and restart in a browser |
