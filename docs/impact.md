# Impact numbers (simulated)

Reproduce with `python -m scripts.impact`. Input: 263 synthetic JUST students, seed 1337, searching at 07:05.
These show how our matching rules behave. They are **not** measured demand, so say "simulated" on the slide.

| Searching alone | Match at their time | Counting cars up to 30 min earlier |
|---|---|---|
| Anyone | 178/263 (68%) | 195/263 (74%) |
| Women, women-only off | 94/120 (78%) | 100/120 (83%) |
| Women, women-only on | 70/120 (58%) | 77/120 (64%) |

| Everyone riding, one car each | Students seated | Cars | Average seat |
|---|---|---|---|
| Cars formed one at a time | 135 (51%) | 38 (21 full) | 1.41 JD |
| All cars planned together | 164 (62%) | 50 (14 full) | 1.52 JD |

- **Women-only costs about 20 points of match rate** at today's density. Offering an earlier car wins back 6.
- **Planning all cars together seats 29 more students** and gives Jeeny 12 more full-fare trips, for 0.11 JD more per seat
  (more cars of 3). This is offline analysis; the live app matches one student at a time.
- Both averages are below taxi + bus (2.10 JD). A student who can walk to a stop pays 0.60 by bus, and RideSync doesn't beat that on price.
