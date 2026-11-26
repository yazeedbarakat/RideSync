# Judge questions

> 26 Nov: RideSync now includes NextStop's ideas: tariff pricing, same-gender matching, group chat,
> ready check, driver offer, late-leave rule and trip summary. Student verification, family link,
> bring-a-friend and Arabic were removed. Numbers below are what the app shows (simulated data).

**One line?**
Book a Jeeny ride to campus, and people of your gender going the same way at the same time share the car and split one fare, up to 4 per car.

**What does it cost?**
One normal Jeeny trip, priced with the LTRC smart-app tariff (taxi meter + 20%), split between the riders.
Al-Andalus → JUST, arrive by 8:00: one fare of JOD 6.87, so JOD 1.75 each with 4 riders. Alone it's JOD 6.90.
Each share is rounded up to 0.05 and the driver keeps the remainder.

**Is fare splitting legal?**
The trip is one booking at one full fare. Riders split that fare among themselves. We never sell per-seat fares,
because that's a separate licensed category (shared "service" taxis). Jeeny's legal team and the LTRC confirm before a pilot. Don't claim it's licensed.

**Where do your prices come from?**
The LTRC 2026 smart-app tariff (flag-fall 0.468, 0.336/km by day), road km from a fixed road model, and a
weekday traffic curve where slow traffic is billed at the waiting rate, like a meter. Our engine reproduces the reference
model's six check values exactly (tests). Not confirmed: the waiting rate, night hours and minimum fare. A real Jeeny Economy
quote sets the `CALIBRATION` factor in `app/config.py` (1.00 today).

**Bus is 0.60. Why pay 1.75?**
Don't pitch "as cheap as the bus". Pitch a short walk to one meeting point, planned to arrive 10 min early, same gender, about 75% less than riding alone.
LTRC is piloting new Irbid bus routes: Sync complements better buses and doesn't depend on buses staying bad.

**Why same gender only?**
Safety and cultural comfort, especially for women. It's the main reason people would share a car with strangers.
Gender is set at signup and can't be changed. Precedent: Uber's Women Preferences.

**What stops a man from signing up as female?**
In the pilot, gender is tied to the verified Jeeny account, the driver sees first names at pickup, and one report suspends the account.
ID verification is on the roadmap. The demo's signup is name + gender only.

**Is the driver the same gender?**
No. Any driver can accept, as today. A female-driver preference is a natural next step.

**What if someone leaves?**
- Before the ready check, a nearby rider can take the seat. Otherwise the shares go up and the car still goes.
- Leaving is free until a driver accepts, and after that until 30 min before pickup.
- Later, the leaver pays their own share (shown as an outstanding balance on their next booking). It's held as a credit on the ride and paid to the driver who completes the trip,
  so the others' share never goes up and the driver still gets the full fare.
  Demo: 3 × 1.75 cash + 1.75 credit = 7.00.

**What's the ready check?**
When the group is set, any rider taps Find driver (or it starts by itself 45 min before pickup). Joining closes, the pickup time becomes final,
and everyone answers Ready or cancels free. No answer in 5 min counts as Ready. Only then does the trip go to drivers.

**What does a driver get?**
A normal shared trip offer: first pickup, full fare, riders, cash to collect, km and minutes, respond-by. One pickup point, so no extra stops.
First accept wins. No driver by pickup − 15 min: the ride is cancelled and nobody pays.

**Is the chat safe?**
First names only. Phone numbers and links are hidden before a message is stored. Read-only after the trip.

**Is there AI?**
Say it plainly: matching is rules-based and runs on the server: same gender, same destination, arrive-by within 10 min, a walk of at most 500 m to one meeting point, at most 4 per car, then the lowest walking and time spread.
The backend still has a trained bus arrival model (1.8 min error vs. 4.6 for a historical average, simulated), not shown in the app. Ask at the briefing whether AI is scored.

**Is this real data?**
No. Riders, drivers and trips are simulated. Coordinates come from OpenStreetMap.

**Is this connected to Jeeny?**
No. We found no public Jeeny API, so booking and dispatch are simulated. The app looks like Jeeny to show where Sync would live.

**Does Jeeny serve Irbid today?**
We could not confirm it. Ask Jeeny first.

**Why would Jeeny want this?**
Every car is a normal Jeeny trip with the usual commission, from people who ride the bus today and pay Jeeny nothing.
Open question: how much would replace solo rides Jeeny already sells? Target scheduled commute trips, where that's least likely.

# Deck and app must match

| Deck | App | Do |
|---|---|---|
| Bus arrival prediction and lateness slides | Not in the app | Remove, or keep as "backend, next step" |
| 1.25 JD shared, 4-5 JD solo | 1.75 each, one fare of 6.87; alone 6.90 | Replace with the app's numbers |
| "Cheaper than taxi + bus (2.10)" | No longer claimed | Reposition: one short walk, on time, same gender, ~75% less than alone |
| "Verified students", "Family sharing", "Women-only toggle" | Removed; every car is same-gender | Remove the badges; say "same-gender rides" |
| Solution slide | Has group chat, ready check, driver offer, late-leave rule, trip summary | Add them |
