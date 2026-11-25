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
  'Sync a ride, from {price}': 'مشاركة رحلة، من {price}', 'Sync to compare': 'مشاركة رحلة للمقارنة',
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
  'Your seat, with {n} riders': 'مقعدك، مع {n} ركاب',
  // Tomorrow
  'Tomorrow, {day}': 'غدًا، {day}', 'Edit week': 'تعديل الأسبوع', Done: 'تم', 'First lecture each day': 'أول محاضرة كل يوم', 'No lecture set for tomorrow.': 'لا محاضرة محددة للغد.',
  Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس',
  'To trust the bus, be at {stop} by {t}': 'لضمان الباص، الموعد في {stop} الساعة {t}', 'On time on {a} of {b} simulated days': 'في الوقت خلال {a} من {b} يوم محاكاة',
  'No bus was reliable for this lecture time': 'لا يوجد باص موثوق لموعد هذه المحاضرة',
  'Shared ride at {t}, {price}': 'رحلة مشتركة الساعة {t}، {price}', 'Women-only. Arrives {t}': 'للطالبات فقط. الوصول {t}', 'Arrives {t}': 'الوصول {t}', Reserve: 'حجز', Cancel: 'إلغاء', 'Seat reserved': 'تم حجز المقعد',
  'No shared ride matches this time yet': 'لا توجد رحلة مشتركة لهذا الموعد بعد',
  // Bus markers on the map
  'seats free': 'مقاعد متاحة', 'almost full': 'شبه ممتلئ', full: 'ممتلئ', '{route}: arrives {t}, {level}': '{route}: الوصول {t}، {level}',
  // Jeeny app around Sync
  'Menu': 'القائمة',
  'Back': 'رجوع',
  'Close': 'إغلاق',
  'Confirm': 'تأكيد',
  'New': 'جديد',
  '(New)': '(جديد)',
  'Box': 'توصيل',
  'Sync': 'Sync',
  'Skip': 'تخطّي',
  'Where to?': 'إلى أين؟',
  'Where to, {name}?': 'إلى أين، {name}؟',
  'Save on every ride': 'توفير في كل رحلة',
  'Bus running late?': 'الباص متأخر؟',
  'Share one car with students going your way': 'سيارة واحدة مع طلاب على نفس الطريق',
  'Try Sync': 'تجربة Sync',
  'Feeling the cold?': 'الجو بارد؟',
  'A warm ride is a tap away': 'رحلة دافئة بلمسة واحدة',
  'Book Now': 'احجز الآن',
  "Discover what's new on Jeeny": 'الجديد في جيني',
  'Taxi': 'تكسي',
  'Student hackathon concept by team 1337. Not the official Jeeny app.': 'فكرة طلابية لهاكاثون من فريق 1337. هذا ليس تطبيق جيني الرسمي.',
  'Your Sync ride leaves at {t}': 'رحلة Sync تنطلق الساعة {t}',
  "You'll be {n} min late by bus": 'تأخير متوقع {n} دقيقة بالباص',
  'Sync from {price}': 'Sync من {price}',
  'Choose a saved place': 'اختيار مكان محفوظ',
  'Jordan University of Science and Technology': 'جامعة العلوم والتكنولوجيا الأردنية',
  'Irbid': 'إربد',
  'Ar Ramtha': 'الرمثا',
  'My Locations': 'أماكني',
  'University': 'جامعة',
  'Hospital': 'مستشفى',
  'Shopping': 'تسوّق',
  'King Abdullah University Hospital': 'مستشفى الملك عبدالله الجامعي',
  'Princess Basma Hospital': 'مستشفى الأميرة بسمة',
  'Arabella Mall': 'أرابيلا مول',
  'Irbid City Center': 'إربد سيتي سنتر',
  'No places found': 'لا توجد نتائج',
  'Only campus trips work in this demo.': 'النسخة التجريبية تدعم رحلات الجامعات فقط.',
  'Not part of this demo. Try Sync.': 'غير متاح في النسخة التجريبية. يمكن تجربة Sync.',
  'Set on Map': 'تحديد على الخريطة',
  'Pickup Location': 'موقع الانطلاق',
  'Confirm Pickup': 'تأكيد الانطلاق',
  'Near {place}': 'قرب {place}',
  'To {place}': 'إلى {place}',
  'To: {place}': 'إلى: {place}',
  'Choose an area': 'اختيار منطقة',
  'My area': 'منطقتي',
  'Jeeny Max': 'جيني ماكس',
  'Subscribe': 'اشتراك',
  'My Rides': 'رحلاتي',
  'Notification': 'الإشعارات',
  'Promotions': 'العروض',
  'Wallet': 'المحفظة',
  'My Wallet': 'محفظتي',
  'My Cards': 'بطاقاتي',
  'Invite & Earn': 'دعوة الأصدقاء',
  'About': 'حول',
  'About Us': 'من نحن',
  'Help Center': 'مركز المساعدة',
  'Jeeny Help Center': 'مركز مساعدة جيني',
  'Drive with Jeeny': 'القيادة مع جيني',
  'Verified student': 'طالب موثّق',
  'Today': 'اليوم',
  'Tomorrow': 'غدًا',
  'Earlier (simulated)': 'سابقًا (محاكاة)',
  'Confirmed': 'مؤكدة',
  'Reserved': 'محجوزة',
  'Completed': 'مكتملة',
  'Nothing new yet': 'لا جديد بعد',
  'No promotions available': 'لا توجد عروض',
  'New offers on your rides will show up here.': 'ستظهر هنا عروض الرحلات الجديدة.',
  'Jeeny Balance': 'رصيد جيني',
  'Add funds': 'إضافة رصيد',
  'This demo has no real payments.': 'لا توجد مدفوعات حقيقية في النسخة التجريبية.',
  'Transaction History': 'سجل العمليات',
  'No transactions yet': 'لا توجد عمليات بعد',
  'Payment Method': 'طريقة الدفع',
  'Add New': 'إضافة',
  'Bring your classmates along': 'مشاركة الرحلة مع الزملاء',
  'A fuller car means a cheaper seat for everyone.': 'كلما امتلأت السيارة انخفض سعر المقعد للجميع.',
  'Share your invite code': 'رمز الدعوة',
  'Share Now': 'مشاركة الآن',
  'Who we are': 'من نحن',
  'Sync is a feature we propose for Jeeny: it predicts when a student bus will really arrive and, if it is late or full, fills one Jeeny car with students going the same way.': 'Sync ميزة نقترحها لجيني: تتوقع وقت وصول باص الطلاب الحقيقي، وإذا تأخر أو امتلأ تجمع طلابًا على نفس الطريق في سيارة جيني واحدة.',
  'Built by team 1337 for the Jeeny Hackathon. This is a student concept and not the official Jeeny app. All students, trips and buses are simulated.': 'من عمل فريق 1337 لهاكاثون جيني. هذه فكرة طلابية وليست تطبيق جيني الرسمي. جميع الطلاب والرحلات والباصات محاكاة.',
  'Map data © OpenStreetMap contributors': 'بيانات الخريطة © مساهمو OpenStreetMap',
  'Get help with recent rides': 'مساعدة في الرحلات الأخيرة',
  'Support': 'الدعم',
  'Support Inbox': 'رسائل الدعم',
  'Jeeny Handbook': 'دليل جيني',
  'Sync questions': 'أسئلة عن Sync',
  'What does a Sync seat cost?': 'كم سعر مقعد Sync؟',
  'One full fare split between the riders. You see the highest price you could pay before you join.': 'أجرة كاملة واحدة تُقسم على الركاب. يظهر أعلى سعر ممكن قبل الانضمام.',
  'Can I ride with women only?': 'هل توجد رحلات للطالبات فقط؟',
  'Yes. Verified female students can turn it on, and then every rider in the car is a woman.': 'نعم. يمكن للطالبات الموثّقات تفعيلها، وعندها تكون جميع الراكبات طالبات.',
  'What if someone drops out?': 'ماذا لو انسحب أحد؟',
  'We look for a replacement at the same time and place. If there is none you may pay the maximum shown, or the ride is cancelled free.': 'نبحث عن بديل في نفس الوقت والمكان. وإن لم يوجد فقد يرتفع السعر إلى الحد الأقصى المعروض أو تُلغى الرحلة مجانًا.',
  'What we offer:': 'ماذا نقدم:',
  'Cashback on rides': 'استرداد نقدي على الرحلات',
  'Cancellation fee refunds': 'استرداد رسوم الإلغاء',
  'FAQs': 'أسئلة شائعة',
  'What is Jeeny Core?': 'ما هو Jeeny Core؟',
  "It's Jeeny's own subscription, shown here only for context.": 'اشتراك خاص بجيني، معروض هنا للتوضيح فقط.',
  'Does Sync need a subscription?': 'هل يحتاج Sync إلى اشتراك؟',
  'No. Sync is pay per ride.': 'لا. الدفع في Sync لكل رحلة.',
  'Subscribe Now': 'اشتراك الآن',
  'Jeeny Account': 'حساب جيني',
  'Name': 'الاسم',
  'Area': 'المنطقة',
  'Gender': 'الجنس',
  'Female': 'أنثى',
  'Male': 'ذكر',
  'Not confirmed': 'غير مؤكد',
  'Date of Birth': 'تاريخ الميلاد',
  'Education': 'التعليم',
  'Employment': 'العمل',
  'Marital status': 'الحالة الاجتماعية',
  'High School': 'ثانوية',
  'Diploma': 'دبلوم',
  'Undergraduate': 'بكالوريوس',
  'Post Graduate': 'دراسات عليا',
  'Self-Employed': 'عمل حر',
  'Private Company Employee': 'قطاع خاص',
  'Public Sector Employee': 'قطاع عام',
  'Unemployed': 'بدون عمل',
  'Single': 'أعزب / عزباء',
  'Married': 'متزوج / متزوجة',
  'Gender comes from the university registry, so women-only rides stay women-only. Other answers stay on this screen and are not saved.': 'الجنس من سجل الجامعة كي تبقى رحلات الطالبات للطالبات فقط. بقية الإجابات تبقى على هذه الشاشة ولا تُحفظ.',
  'Manage': 'إدارة',
  'Logout': 'تسجيل الخروج',
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
const money = (n) => (lang === 'ar' ? ltr(n.toFixed(2)) + ' د.أ' : 'JOD\u00a0' + n.toFixed(2));
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
