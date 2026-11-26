# Student survey (2 minutes)

Ask 20-30 students at the station and on campus, not only friends. Don't collect names or numbers.
Ask about last week before showing the idea, so answers aren't shaped by it.

| # | English | العربية |
|---|---|---|
| 1 | Which university, and which area do you live in? | في أي جامعة تدرس/ين، وفي أي منطقة تسكن/ين؟ |
| 2 | How did you get to campus on your last study day? | كيف وصلت إلى الجامعة في آخر يوم دوام؟ |
| 3 | What did that trip cost in total, with any taxi? | كم كلّف المشوار كاملًا مع أي تكسي؟ |
| 4 | How long did you wait for the bus to leave? | كم انتظرت حتى تحرّك الباص؟ |
| 5 | In the last 2 weeks, how many lectures did you miss or reach late because of transport? | في آخر أسبوعين، كم محاضرة فاتتك أو تأخرت عنها بسبب المواصلات؟ |
| 6 | Have you shared a taxi with students you didn't know? What made you comfortable or not? | هل شاركت تكسي مع طلاب لا تعرفهم؟ ما الذي أراحك أو أزعجك؟ |
| 7 | *Show the app.* What do you think this does? | *بعد عرض التطبيق:* برأيك ماذا يفعل هذا التطبيق؟ |
| 8 | What is the most you would pay for a seat that gets you there on time? | ما أعلى سعر تدفعه/ينه لمقعد يوصلك في الوقت؟ |
| 9 | How far would you walk to a meeting point? | كم تمشي/ين إلى نقطة اللقاء؟ |
| 10 | Would you want women-only? Would you still use it without? (optional) | هل تفضّلين رحلة للطالبات فقط؟ وهل تستخدمينه بدونها؟ (اختياري) |

**Report on the slide:** number asked, median trip cost (Q3), median wait (Q4), late lectures (Q5), median price (Q8), and one real quote.
If the Q8 median is under 1.25 JD, the price story has to change: better to learn it before the judges say it.

# Recording a real bus trip

1. On the bus, record with any phone app that exports GPX, from boarding until campus. Note when it left and how full it was.
2. `python -m scripts.compare_gps trip.gpx R2` (R1 = Amman Station, R2 = Sheikh Khaleel, R3 = North Station to Yarmouk).
3. Keep GPX files out of git: they show where someone lives. One or two trips are an example, not proof.
