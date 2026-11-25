# Judge questions

**Is this real data?**
No. Students, trips and live buses are simulated. Station and campus coordinates come from OpenStreetMap. The model is really trained on the simulated trips and scored on 3 days it never saw.

**Where will real bus data come from?**
Students. The backend already takes a rider's report (where the bus is and how full) and the same model forecasts again from it; the demo screen has no button for this. One report is trusted on its own. A pilot needs agreement between riders or phone GPS before it changes anyone else's forecast.

**What is the AI?**
1. Gradient-boosted arrival and crowding models: 1.8 min average error against 4.6 for a historical average (simulated, held out).
2. Quantile models for the range and the chance of being late. The 80% range held 79% of held-out arrivals.
   We compared two settings on those same days, so treat 79% as slightly optimistic.
3. Group matching under hard rules: campus, time window, walking distance, women-only for every rider.

Good live example: set the lecture to 08:15. The best guess (08:14) is on time, but the app shows a 41% chance of being late.

**What about the trip home?**
Not built. Lectures end at fixed times, so matching is the same problem in reverse with one pickup point (campus) and spread-out drop-offs. We start with mornings because being late is what costs students a lecture.

**Why would Jeeny want this?**
Every car is a normal Jeeny trip at one full fare with the usual commission, from students who take the bus today because a 4-5 JD solo ride is too much. Open question to ask Jeeny: how much of it replaces solo rides they already sell?

**What does a driver get?**
One full fare and one pickup point, so no extra stops. Students walk to it (up to 500 m).

**What if someone drops out?**
The app looks for a replacement who fits without moving the pickup or the time. If there is none, 3 riders pay 1.67 each, the maximum shown before joining. Below 3, the ride is cancelled free. Not solved yet: what a no-show owes.

**Is it safe for women?**
A women-only car has only women riders, and gender comes from the university registry, never from the app. The driver may be a man: that needs Jeeny. Family can follow a trip through a private link that shows only that rider and can be stopped.

**Why not a WhatsApp group?**
It can't tell you the bus will be late, check who is a student, keep the walk and times fair, or settle the price before you join.

**Bus is 0.60. Why pay 1.25?**
If you walk to a stop and the bus has room, take the bus: the app says so. We are for the student already paying 2.10 for taxi + bus.
