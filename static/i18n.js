'use strict';
// English is the source text and the key. Missing Arabic falls back to English.
// Phrased without addressing the reader's gender where Arabic would force it.
const AR = {
  // Opening screen
  'Will your bus make it to class?': 'هل يصل الباص قبل المحاضرة؟',
  "See when it will really arrive. If it's late, split a Jeeny ride with students going your way.": 'وقت وصول الباص الحقيقي. وعند التأخير، رحلة جيني مشتركة مع طلاب على نفس الطريق.',
  'University email': 'البريد الجامعي', 'Verify student status': 'تأكيد صفة الطالب', 'or try a demo student': 'أو تجربة حساب طالب',
  '8:00 at JUST': '8:00 في التكنولوجيا',
  "Demo verification checks the email domain only. No email is sent and the address isn't saved. All data is simulated.": 'التحقق في النسخة التجريبية يفحص نطاق البريد فقط. لا تُرسل أي رسالة ولا يُحفظ العنوان. جميع البيانات محاكاة.',
  'Use your university email (JUST, Yarmouk or Al al-Bayt)': 'المطلوب بريد جامعي (التكنولوجيا أو اليرموك أو آل البيت)',
  "Can't reach RideSync. Check your connection and try again.": 'تعذّر الاتصال بـ RideSync. يرجى التحقق من الإنترنت والمحاولة مجددًا.',
  'Please verify again': 'يرجى تأكيد صفة الطالب من جديد', 'Please verify your student email first': 'يرجى تأكيد البريد الجامعي أولًا',
  'Something went wrong. Please try again.': 'حدث خطأ. يرجى المحاولة مجددًا.',
  // Home
  'Simulated data': 'بيانات محاكاة', From: 'من', To: 'إلى', Lecture: 'المحاضرة', 'Lecture {t}': 'المحاضرة {t}', Bus: 'الباص', Ride: 'مشوار',
  'Switch student': 'تبديل الطالب', 'Restart the demo clock': 'إعادة تشغيل ساعة العرض',
  'That lecture has already started': 'بدأت هذه المحاضرة', 'No bus you can catch right now': 'لا يوجد باص يمكن اللحاق به الآن',
  "You'll be {n} min late": 'تأخير متوقع {n} دقيقة', 'The bus will be full': 'الباص سيكون ممتلئًا', 'Cutting it close': 'الوقت ضيّق', "You'll make it by bus": 'الباص يصل في الوقت',
  'Taxi to {stop}, then the {route} bus around {t}': 'تكسي إلى {stop}، ثم باص {route} حوالي {t}',
  'Walk to {stop}, then the {route} bus around {t}': 'مشيًا إلى {stop}، ثم باص {route} حوالي {t}',
  "{p} chance you're late": 'احتمال التأخير {p}', 'likely arrival {a}–{b}': 'الوصول المرجّح {a}–{b}', 'over {p}%': 'أكثر من {p}%', 'under {p}%': 'أقل من {p}%',
  'bus arrives': 'وصول الباص', 'taxi + bus': 'تكسي + باص', 'bus fare': 'أجرة الباص', '{n}% full at your stop': 'ممتلئ {n}% عند الموقف',
  'Shared rides are JUST-only in this pilot.': 'الرحلات المشتركة لجامعة التكنولوجيا فقط حاليًا.', 'Shared rides are JUST-only in this pilot': 'الرحلات المشتركة لجامعة التكنولوجيا فقط حاليًا',
  'Sync a ride': 'مشاركة رحلة', 'Sync to compare': 'مشاركة رحلة للمقارنة',
  'No match yet': 'لا توجد مجموعة بعد', 'No group of {n}+ students nearby for this time yet': 'لا توجد مجموعة من {n} طلاب أو أكثر قريبة في هذا الوقت بعد',
  'Women-only ride': 'رحلة للطالبات فقط', 'Women-only rides need a profile confirmed by the university registry.': 'رحلات الطالبات فقط تتطلب ملفًا مؤكدًا من سجل الجامعة.',
  'Women-only rides need a verified female student profile': 'رحلات الطالبات فقط تتطلب ملف طالبة مؤكدًا',
  You: 'أنا', Pickup: 'الانطلاق', '{label}, about {n} m walk': '{label}، حوالي {n} م مشيًا', '{hood} meeting point': 'نقطة لقاء {hood}',
  '{n} students going your way': '{n} طلاب على نفس الطريق', '{n} women going your way': '{n} طالبات على نفس الطريق',
  "No car fits your exact time. This one arrives {n} min earlier.": 'لا توجد سيارة في الوقت المطلوب تمامًا. هذه تصل أبكر بـ {n} دقيقة.',
  'Join for {price}': 'انضمام مقابل {price}', 'At most {price} if someone drops out. Needs {n} riders.': '{price} كحد أقصى إذا انسحب أحد. الحد الأدنى {n} ركاب.',
  'The ride needs all {n} riders to go ahead.': 'تنطلق الرحلة بوجود الركاب الـ {n} جميعًا.',
  "You're in. Be there by {t}": 'تم الانضمام. الموعد {t}', 'On your way': 'في الطريق', "You've arrived": 'تم الوصول',
  'saved vs. taxi + bus': 'توفير مقابل تكسي + باص', 'saved vs. solo taxi': 'توفير مقابل تكسي خاص',
  'The bus was {n} min late': 'تأخر الباص {n} دقيقة', 'The bus was on time': 'وصل الباص في الوقت', 'The bus would be {n} min late': 'الباص كان سيتأخر {n} دقيقة', 'The bus would be on time': 'الباص كان سيصل في الوقت',
  'This ride has already left. Sync again to find another.': 'انطلقت هذه الرحلة. يمكن البحث عن رحلة أخرى.', 'The ride has already left': 'انطلقت الرحلة', 'Ride not found': 'الرحلة غير موجودة',
  'Play the trip': 'تشغيل الرحلة', 'Leave ride': 'مغادرة الرحلة', 'Demo: {name} drops out': 'عرض: انسحاب {name}',
  '{a} dropped out. {b} took the seat, so nothing changes for you.': 'انسحاب {a}، والمقعد أخذه {b}. لا تغيير في الموعد أو السعر.',
  '{a} dropped out and nobody nearby could fill in. With {n} riders the seat is {price}.': 'انسحاب {a} ولا بديل قريب. السعر مع {n} ركاب هو {price}.',
  '{a} dropped out, so fewer than {n} riders were left and the ride was cancelled. No charge.': 'انسحاب {a}، وبقي أقل من {n} ركاب فأُلغيت الرحلة دون أي رسوم.',
  'Share trip with family': 'مشاركة الرحلة مع العائلة', 'Family can follow this trip': 'يمكن للعائلة متابعة هذه الرحلة', Copy: 'نسخ', Copied: 'تم النسخ', Open: 'فتح', 'Stop sharing': 'إيقاف المشاركة', 'Trip link': 'رابط الرحلة',
  '{name} is sharing a RideSync trip': 'رحلة RideSync مشتركة من {name}',
  // Prices
  'What the trip costs': 'تكلفة المشوار', 'Bus only': 'باص فقط', 'Taxi + bus': 'تكسي + باص', 'Solo taxi': 'تكسي خاص', 'RideSync price with {n} riders.': 'سعر RideSync مع {n} ركاب.',
  // Tomorrow
  'Tomorrow, {day}': 'غدًا، {day}', 'Edit week': 'تعديل الأسبوع', Done: 'تم', 'First lecture each day': 'أول محاضرة كل يوم', 'No lecture set for tomorrow.': 'لا محاضرة محددة للغد.',
  Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس',
  'To trust the bus, be at {stop} by {t}': 'لضمان الباص، الموعد في {stop} الساعة {t}', 'On time on {a} of {b} simulated days': 'في الوقت خلال {a} من {b} يوم محاكاة',
  'No bus was reliable for this lecture time': 'لا يوجد باص موثوق لموعد هذه المحاضرة',
  'Shared ride at {t}, {price}': 'رحلة مشتركة الساعة {t}، {price}', 'Women-only. Arrives {t}': 'للطالبات فقط. الوصول {t}', 'Arrives {t}': 'الوصول {t}', Reserve: 'حجز', Cancel: 'إلغاء', 'Seat reserved': 'تم حجز المقعد',
  'No shared ride matches this time yet': 'لا توجد رحلة مشتركة لهذا الموعد بعد',
  // Buses
  'Buses now': 'الباصات الآن', Arrived: 'وصل', 'Waiting to fill': 'ينتظر الامتلاء', 'On the road': 'في الطريق', 'seats free': 'مقاعد متاحة', 'almost full': 'شبه ممتلئ', full: 'ممتلئ', '{when}, gets {level}': '{when}، سيصبح {level}',
  '{route}: arrives {t}, {level}': '{route}: الوصول {t}، {level}', 'Rider report {t}': 'بلاغ راكب {t}',
  "I'm on this bus": 'أنا في هذا الباص', 'Where is it?': 'أين الباص؟', 'How full is it?': 'ما مدى امتلائه؟', 'Still waiting at {stop}': 'ما زال ينتظر في {stop}', 'Just left {stop}': 'غادر {stop} الآن',
  'Thanks. Arrival updated {a} → {b}': 'شكرًا. تحديث الوصول من {a} إلى {b}', "Thanks. Arrival is still {a}": 'شكرًا. الوصول ما زال {a}',
  "That doesn't match where the bus was last seen": 'لا يتوافق هذا مع آخر موقع للباص', 'This bus has already arrived': 'وصل هذا الباص',
  'Arrival model: {m} min average error vs. {b} min for a historical average, on {d} held-out days of simulated trips. Its 80% range held the real arrival {c}% of the time.': 'نموذج الوصول: متوسط خطأ {m} دقيقة مقابل {b} دقيقة للمتوسط التاريخي، على {d} أيام محاكاة لم يتدرب عليها. ونطاق 80% شمل الوصول الفعلي في {c}% من الحالات.',
  // Family page
  'Trip to {campus}': 'رحلة إلى {campus}', '{name} is waiting for pickup': '{name}: بانتظار الانطلاق', '{name} is on the way': '{name}: في الطريق', '{name} has arrived': '{name}: تم الوصول',
  'Pickup at {place}': 'الانطلاق من {place}', 'Shared car with {n} verified students': 'سيارة مشتركة مع {n} طلاب موثّقين', 'Women-only car': 'سيارة للطالبات فقط',
  'Updated {n} s ago': 'آخر تحديث قبل {n} ث', 'This trip is no longer shared': 'لم تعد هذه الرحلة مشتركة', 'Simulated demo trip. The route is approximate.': 'رحلة تجريبية محاكاة. المسار تقريبي.',
  // Places and routes
  'Yarmouk University': 'جامعة اليرموك', JUST: 'التكنولوجيا', Yarmouk: 'اليرموك',
  'Al-Andalus': 'الأندلس', 'Al-Zahra': 'الزهراء', 'Al-Rawda': 'الروضة', 'Al-Nuzha': 'النزهة', 'Al-Midan': 'الميدان', 'Al-Jami': 'الجامع', 'Al-Tall': 'التل', 'Al-Manara': 'المنارة', 'Al-Afrah': 'الأفراح', 'Al-Hikma': 'الحكمة', 'Al-Wurud': 'الورود', Hanina: 'حنينا', 'Al-Buqa': 'البقعة', Hawwara: 'حوارة', Sarih: 'الصريح',
  'Amman Station': 'مجمع عمّان', 'North Station': 'مجمع الشمال', 'Sheikh Khaleel Station': 'مجمع الشيخ خليل', 'Sheikh Khaleel': 'الشيخ خليل',
  // Demo names
  A: 'أ', L: 'ل', Ahmad: 'أحمد', Student: 'طالب', Sara: 'سارة', Lina: 'لينا', Rania: 'رانيا', Dana: 'دانا', Nour: 'نور', Hala: 'هلا', Aya: 'آية', Tala: 'تالا', Reem: 'ريم', Jana: 'جنى', Maha: 'مها', Yara: 'يارا',
  Omar: 'عمر', Khaled: 'خالد', Yousef: 'يوسف', Zaid: 'زيد', Tareq: 'طارق', Laith: 'ليث', Hamza: 'حمزة', Sami: 'سامي', Faris: 'فارس', Anas: 'أنس', Bilal: 'بلال', Qais: 'قيس',
};
let lang = 'en';
try { if (localStorage.getItem('ridesync-lang') === 'ar') lang = 'ar'; } catch { /* private mode */ }

// Isolate left-to-right values (times, ranges, prices) so Arabic text can't reorder them.
const ltr = (s) => (lang === 'ar' ? '⁦' + s + '⁩' : String(s));
function t(text, vars = {}) {
  const s = (lang === 'ar' && Object.hasOwn(AR, text) && AR[text]) || text;
  return s.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? vars[k] : all));
}
const money = (n) => (lang === 'ar' ? ltr(n.toFixed(2)) + ' د.أ' : n.toFixed(2) + ' JD');
const tRoute = (name) => name.split(' → ').map((x) => t(x)).join(lang === 'ar' ? ' ← ' : ' → ');
function tPickup(label) {
  const hood = label.replace(/ meeting point$/, '');
  return hood === label ? t(label) : t('{hood} meeting point', { hood: t(hood) });
}
function applyLang(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  for (const n of root.querySelectorAll('[data-t]')) {
    n.dataset.t = n.dataset.t || n.textContent; // remember the English source
    n.textContent = t(n.dataset.t);
  }
  for (const b of root.querySelectorAll('[data-lang]')) {
    b.textContent = lang === 'ar' ? 'EN' : 'ع';
    b.setAttribute('aria-label', lang === 'ar' ? 'English' : 'العربية');
  }
}
function toggleLang(after) {
  lang = lang === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('ridesync-lang', lang); } catch { /* private mode */ }
  applyLang();
  if (after) after();
}
