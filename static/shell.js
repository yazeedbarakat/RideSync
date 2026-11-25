'use strict';
// The Jeeny-style app around Sync: screens, menu and the simple pages. Uses helpers from app.js.
// Nothing here is stored or sent: account choices live in memory and no real payment exists.
let view = '', pmap = null, pickHood = null, dest = null, cat = 'My Locations', account = {};
const ROOTS = ['login', 'launch'];
const SCREENS = ['login', 'launch', 'where', 'pickup', 'home'];
// Places outside the pilot are listed like in the app, but only campuses can be booked here.
const PLACES = {
  University: [{ name: 'JUST', sub: 'Jordan University of Science and Technology', campus: 'JUST' }, { name: 'Yarmouk University', sub: 'Irbid', campus: 'Yarmouk' }],
  Hospital: [{ name: 'King Abdullah University Hospital', sub: 'Ar Ramtha' }, { name: 'Princess Basma Hospital', sub: 'Irbid' }],
  Shopping: [{ name: 'Arabella Mall', sub: 'Irbid' }, { name: 'Irbid City Center', sub: 'Irbid' }],
};
const MENU = [['home', 'link', 'Sync', 'New'], ['max', 'link', 'Jeeny Max', 'Subscribe'], ['rides', 'clock', 'My Rides'], ['notes', 'bell', 'Notification'], ['promos', 'promo', 'Promotions'],
  ['wallet', 'wallet', 'Wallet'], ['cards', 'card', 'My Cards'], ['invite', 'gift', 'Invite & Earn'], ['about', 'info', 'About'], ['help', 'help', 'Help Center', '(New)']];
const NOT_IN_DEMO = 'Not part of this demo. Try Sync.';

// --- Moving between screens ---
function show(name) {
  view = name;
  const page = !SCREENS.includes(name);
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === (page ? 'page' : name));
  closeMenu(); closeDialog();
  if (page) renderPage();
  if (name === 'launch') renderLaunch();
  if (name === 'where') renderWhere();
  if (name === 'pickup') openPickup();
  if (name === 'home' && map) { map.invalidateSize(); if (lastCheck) drawMap(currentTrip()); }
}
function go(name, replace = ROOTS.includes(name)) {
  if (name === view) { closeMenu(); return; }
  if (name === 'where') { cat = 'My Locations'; $('q').value = ''; }
  if (name === 'pickup' && view !== 'where') dest = $('campus').value;
  history[replace ? 'replaceState' : 'pushState']({ s: name }, '');
  show(name);
}
function back() { if (history.state && !ROOTS.includes(history.state.s)) history.back(); else show('launch'); }
addEventListener('popstate', (e) => {
  if (!cfg) return;
  const s = e.state && e.state.s;
  show(!me ? 'login' : !s || s === 'login' ? 'launch' : s);
});
function openMenu() { renderMenu(); $('shade').hidden = false; $('drawer').inert = false; $('drawer').classList.add('on'); $('drawer').focus(); }
function closeMenu() {
  if (!$('drawer').classList.contains('on')) return;
  if ($('drawer').contains(document.activeElement)) $('open-menu').focus({ preventScroll: true });
  $('drawer').classList.remove('on'); $('drawer').inert = true; $('shade').hidden = true;
}
let toastTimer = 0;
function toast(text) {
  $('toast').textContent = t(text); $('toast').classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('on'), 2600);
}

// --- Bottom sheet ---
let dialogFrom = null;
function closeDialog() {
  if ($('dialog').hidden) return;
  $('dialog').hidden = true; $('shade').hidden = true;
  if (dialogFrom && dialogFrom.isConnected) dialogFrom.focus();
}
function dialog(title, kids, onConfirm) {
  dialogFrom = document.activeElement;
  const x = el('button', { className: 'x', ariaLabel: t('Close') }, icon('x'));
  x.onclick = closeDialog;
  const ok = el('button', { className: 'primary', textContent: t('Confirm') });
  ok.onclick = () => { onConfirm(); closeDialog(); };
  $('dialog').ariaLabel = t(title);
  $('dialog').replaceChildren(el('i', { className: 'grab' }), x, el('h2', { textContent: t(title) }), el('div', { className: 'opts' }, ...kids), ok);
  $('shade').hidden = false; $('dialog').hidden = false;
  x.focus();
}
function pick(title, options, current, done) { // options: [value, label]
  let value = current;
  dialog(title, options.map(([v, label]) => {
    const r = el('input', { type: 'radio', name: 'pick', checked: v === current });
    r.onchange = () => { value = v; };
    return el('label', { className: 'radio' }, r, el('span', { textContent: t(label) }));
  }), () => { if (value != null) done(value); });
}

// --- Home ---
const iconBox = (name) => el('span', { className: 'ib' }, icon(name));
function row(ic, title, sub, onclick, end) {
  const b = el('button', {}, iconBox(ic), el('span', {}, el('b', { textContent: title }), sub ? el('small', { textContent: sub }) : null), end || null);
  b.onclick = onclick;
  return el('li', {}, b);
}
const hoodName = (id) => t(cfg.hoods.find((h) => h.id === id).name);
const syncState = () => { // one line about today's trip, or null before the first check
  const c = lastCheck;
  if (joinedRide) return { cls: 'in', title: t('Your Sync ride leaves at {t}', { t: joinedRide.depart }), sub: t('Arrives {t}', { t: joinedRide.arrive }) + ' · ' + money(joinedRide.seat_price) };
  if (!c) return null;
  const canSync = cfg.sync_campuses.includes($('campus').value);
  const title = c.past ? t('That lecture has already started') : !c.bus ? t('No bus you can catch right now') : c.late_min ? t("You'll be {n} min late by bus", { n: c.late_min })
    : c.full ? t('The bus will be full') : c.risky ? t('Cutting it close') : t("You'll make it by bus");
  const bad = !c.past && (!c.bus || c.late_min || c.full);
  return { cls: bad ? 'bad' : c.risky ? 'warn' : 'ok', title, bad,
    sub: t('Lecture {t}', { t: c.lecture }) + ' · ' + t($('campus').value) + (canSync && !c.past ? ' · ' + t('Sync from {price}', { price: money(cfg.prices.ridesync) }) : '') };
};
function renderAlert() {
  const st = syncState();
  $('alert').hidden = !st;
  if (!st) return;
  $('alert').className = 'alert ' + st.cls;
  const body = [icon(joinedRide ? 'check' : 'bus'), el('span', {}, el('b', { textContent: st.title }), el('small', { textContent: st.sub })), icon('next')];
  body[2].classList.add('flip');
  $('alert').replaceChildren(...body);
}
function renderLaunch() {
  $('where-hello').textContent = t('Where to, {name}?', { name: t(me.profile.first_name) });
  $('recent').replaceChildren(
    row('clock', t('JUST'), t('Jordan University of Science and Technology'), () => choose(PLACES.University[0])),
    row('clock', t('Yarmouk University'), t('Irbid'), () => choose(PLACES.University[1])),
    row('heart', t('Choose a saved place'), '', () => go('where')));
  renderAlert();
}
function updateShell() { // called by app.js whenever the trip changes
  if (!me) return;
  if (view === 'launch') renderAlert();
  else if (['rides', 'notes'].includes(view)) renderPage();
  $('open-bell').classList.toggle('dotted', notes().length > 0);
}

// --- Where to and pickup ---
function choose(p) {
  if (!p.campus) { toast('Only campus trips work in this demo.'); return; }
  dest = p.campus; go('pickup');
  $('pto').textContent = t('To {place}', { place: t(dest) });
}
function renderWhere() {
  $('q').placeholder = t('Where to?');
  const cats = ['My Locations', ...Object.keys(PLACES)];
  $('cats').replaceChildren(...cats.map((c) => {
    const b = el('button', { textContent: t(c), className: c === cat ? 'on' : '', ariaPressed: String(c === cat) });
    b.onclick = () => { cat = c; $('q').value = ''; renderWhere(); };
    return b;
  }));
  const q = $('q').value.trim().toLowerCase();
  const all = Object.values(PLACES).flat();
  const list = q ? all.filter((p) => [p.name, p.sub, t(p.name), t(p.sub)].join(' ').toLowerCase().includes(q))
    : cat === 'My Locations' ? PLACES.University : PLACES[cat];
  $('results').replaceChildren(...(list.length ? list.map((p) => row(cat === 'My Locations' && !q ? 'clock' : 'pin', t(p.name), t(p.sub), () => choose(p)))
    : [el('li', { className: 'none', textContent: t('No places found') })]));
}
function openPickup() {
  dest = dest || $('campus').value;
  if (!pmap) {
    pmap = L.map('pmap', { zoomControl: false }).setView([32.55, 35.86], 15);
    pmap.attributionControl.setPrefix('');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(pmap);
    pmap.on('dragend zoomend', () => { // snap the name to the nearest known area
      const m = pmap.getCenter();
      const near = cfg.hoods.reduce((a, h) => (pmap.distance(m, [h.lat, h.lon]) < pmap.distance(m, [a.lat, a.lon]) ? h : a));
      setPick(near.id, false);
    });
  }
  pmap.invalidateSize();
  setPick($('hood').value);
}
function setPick(id, move = true) {
  pickHood = id;
  const h = cfg.hoods.find((x) => x.id === id);
  if (move) pmap.setView([h.lat, h.lon], 15, { animate: false });
  $('pname').textContent = t('Near {place}', { place: t(h.name) }) + (lang === 'ar' ? '، ' : ', ') + t('Irbid');
  $('pto').textContent = t('To {place}', { place: t(dest) });
}
function confirmPickup() {
  const changed = $('hood').value !== pickHood || $('campus').value !== dest;
  $('hood').value = pickHood; $('campus').value = dest;
  go('home', true);
  if (changed) refresh(); // the same trip keeps any joined ride
}

// --- Menu ---
function renderMenu() {
  $('me-uni').textContent = t('Verified student') + ' · ' + t(me.profile.university);
  const items = MENU.map(([to, ic, name, tag]) => {
    const n = to === 'notes' ? notes().length : 0;
    const b = el('button', {}, icon(ic), el('span', {}, t(name), tag || n ? el('em', { textContent: n || t(tag) }) : null), icon('next'));
    b.lastChild.classList.add('flip');
    b.onclick = () => go(to);
    return b;
  });
  const lb = el('button', {}, icon('globe'), el('span', { textContent: lang === 'ar' ? 'English' : 'العربية' }), icon('next'));
  lb.lastChild.classList.add('flip');
  lb.onclick = () => toggleLang(rerender);
  $('menu').replaceChildren(...items, lb);
}

// --- Simple pages ---
const notes = () => { // only things that really happened in this session
  const out = [], c = lastCheck;
  if (joinedRide) out.push([t('Your Sync ride leaves at {t}', { t: joinedRide.depart }), t('{label}, about {n} m walk', { label: tPickup(joinedRide.pickup.label), n: joinedRide.pickup.walk_m }), 'home']);
  else if (c && !c.past && c.bus && c.late_min) out.push([t("You'll be {n} min late by bus", { n: c.late_min }), t('Sync from {price}', { price: money(cfg.prices.ridesync) }), 'home']);
  if (reserved) out.push([t('Seat reserved'), t('Tomorrow, {day}', { day: t(DAYS[tomorrow()]) }) + ' · ' + reserved.depart, 'home']);
  return out;
};
function rideRows() {
  const p = cfg.prices, rows = [];
  if (joinedRide) rows.push(['Today', joinedRide.campus, joinedRide.depart, joinedRide.seat_price, 'Confirmed']);
  if (reserved) rows.push(['Tomorrow', reserved.campus, reserved.depart, reserved.seat_price, 'Reserved']);
  rows.push(['Earlier (simulated)', 'Amman Station', '07:02', p.taxi_plus_bus - p.bus, 'Completed'], ['Earlier (simulated)', 'JUST', '09:10', p.solo_taxi, 'Completed'], ['Earlier (simulated)', 'Amman Station', '06:58', p.taxi_plus_bus - p.bus, 'Completed']);
  return rows;
}
function rideItem([, to, time, price, state]) {
  return row('car', t('To: {place}', { place: t(to) }), '', () => (state === 'Completed' ? choose(PLACES.University[0]) : go('home')),
    el('span', { className: 'rmeta' }, el('small', { textContent: time + ' · ' + money(price) }), el('small', { className: 'st', textContent: t(state) })));
}
const button = (text, fn, cls = 'primary') => { const b = el('button', { className: cls, textContent: t(text) }); b.onclick = fn; return b; };
const soon = () => toast(NOT_IN_DEMO);
const p = (text, cls = 'txt') => el('p', { className: cls, textContent: t(text) });
const h2 = (text) => el('h2', { textContent: t(text) });
function field(ic, label, value, fn) {
  const b = el(fn ? 'button' : 'div', { className: 'field' }, icon(ic), el('span', { textContent: t(label) }), el('b', { textContent: value || '' }), fn ? icon('next') : null);
  if (fn) { b.onclick = fn; b.lastChild.classList.add('flip'); }
  return b;
}
const choice = (ic, label, options) => field(ic, label, account[label] && t(account[label]), () => pick(label, options.map((o) => [o, o]), account[label], (v) => { account[label] = v; renderPage(); }));
const faq = (q, a) => el('details', {}, el('summary', { textContent: t(q) }), p(a));
const tick = (text) => el('p', { className: 'tick' }, el('span', {}, icon('check')), t(text));

const PAGES = {
  rides: () => ({ title: 'My Rides', body: [...new Set(rideRows().map((r) => r[0]))].flatMap((g) => [h2(g), el('ul', { className: 'places rides' }, ...rideRows().filter((r) => r[0] === g).map(rideItem))]) }),
  notes: () => ({ title: 'Notification', cls: 'grey', body: notes().length ? notes().map(([a, b, to]) => {
    const n = el('button', { className: 'notecard' }, el('b', { textContent: a }), el('span', { textContent: b }), el('em', { textContent: t('Open') }));
    n.onclick = () => go(to);
    return n;
  }) : [p('Nothing new yet', 'txt mid')] }),
  promos: () => ({ title: 'Promotions', body: [el('div', { className: 'blank' }, el('span', { className: 'disc-ic' }, icon('ticket')), h2('No promotions available'), p('New offers on your rides will show up here.'))], foot: button('Book Now', () => go('where')) }),
  wallet: () => ({ title: 'My Wallet', cls: 'rosy', body: [el('div', { className: 'bal' }, p('Jeeny Balance', 'lbl'), el('strong', { textContent: money(0) }), icon('link'), button('Add funds', soon), p('This demo has no real payments.', 'lbl')),
    el('div', { className: 'lift' }, h2('Transaction History'), p('No transactions yet'))] }),
  cards: () => ({ title: '', cls: 'grey', body: [el('h1', { className: 'huge', textContent: t('My Cards') }), el('div', { className: 'between' }, p('Payment Method'), button('Add New', soon, 'link'))] }),
  invite: () => ({ title: 'Invite & Earn', cls: 'grey', body: [el('h1', { className: 'huge pinkish', textContent: t('Bring your classmates along') }), p('A fuller car means a cheaper seat for everyone.'), p('Share your invite code', 'lbl'),
    (() => { const b = el('button', { className: 'code' }, el('span', { textContent: 'SYNC-DEMO' }), icon('copy')); b.onclick = async () => { try { await navigator.clipboard.writeText('SYNC-DEMO'); toast('Copied'); } catch { soon(); } }; return b; })(),
    button('Share Now', soon)] }),
  about: () => ({ title: 'About Us', body: [h2('Who we are'), p('Sync is a feature we propose for Jeeny: it predicts when a student bus will really arrive and, if it is late or full, fills one Jeeny car with students going the same way.'),
    p('Built by team 1337 for the Jeeny Hackathon. This is a student concept and not the official Jeeny app. All students, trips and buses are simulated.'), p('Map data © OpenStreetMap contributors', 'lbl')] }),
  help: () => ({ title: 'Jeeny Help Center', body: [h2('Get help with recent rides'), el('ul', { className: 'places rides' }, ...rideRows().slice(0, 3).map(rideItem)), h2('Support'),
    el('div', { className: 'plainlist' }, field('mail', 'Support Inbox', '', soon), field('info', 'About', '', () => go('about')), field('help', 'Jeeny Handbook', '', soon)),
    h2('Sync questions'), faq('What does a Sync seat cost?', 'One full fare split between the riders. You see the highest price you could pay before you join.'), faq('Can I ride with women only?', 'Yes. Verified female students can turn it on, and then every rider in the car is a woman.'), faq('What if someone drops out?', 'We look for a replacement at the same time and place. If there is none you may pay the maximum shown, or the ride is cancelled free.')] }),
  max: () => ({ title: '', cls: 'rosy', body: [el('div', { className: 'maxlogo' }, icon('link'), 'MAX'), el('h1', { className: 'mid', textContent: 'Jeeny Core' }), el('div', { className: 'boxed' }, p('What we offer:'), tick('Cashback on rides'), tick('Cancellation fee refunds')),
    p('FAQs', 'lbl'), faq('What is Jeeny Core?', "It's Jeeny's own subscription, shown here only for context."), faq('Does Sync need a subscription?', 'No. Sync is pay per ride.')], foot: button('Subscribe Now', soon) }),
  account: () => ({ title: 'Jeeny Account', cls: 'acct', body: [el('div', { className: 'hero2' }, el('span', { className: 'sqav big', textContent: t(me.profile.first_name)[0] }), el('b', { textContent: t(me.profile.first_name) }), p('Verified student', 'lbl')),
    el('div', { className: 'fields' }, field('user', 'Name', t(me.profile.first_name)), field('school', 'University', t(me.profile.university)), field('pin', 'Area', hoodName(me.profile.hood)), field('clock', 'Lecture', me.profile.lecture)),
    el('div', { className: 'fields' }, field('users', 'Gender', t(me.profile.gender === 'F' ? 'Female' : me.profile.gender === 'M' ? 'Male' : 'Not confirmed')),
      field('cal', 'Date of Birth', account.dob, () => { const d = el('input', { type: 'date', value: account.dob || '', max: '2010-12-31', ariaLabel: t('Date of Birth') }); dialog('Date of Birth', [d], () => { account.dob = d.value; renderPage(); }); }),
      choice('school', 'Education', ['High School', 'Diploma', 'Undergraduate', 'Post Graduate']), choice('bag', 'Employment', ['Self-Employed', 'Private Company Employee', 'Public Sector Employee', 'Unemployed']), choice('users', 'Marital status', ['Single', 'Married'])),
    p('Gender comes from the university registry, so women-only rides stay women-only. Other answers stay on this screen and are not saved.', 'lbl pad'),
    el('div', { className: 'fields' }, field('sliders', 'Manage', '', () => go('manage')))] }),
  manage: () => ({ title: 'Jeeny Account', cls: 'acct', body: [el('div', { className: 'fields' }, field('swap', 'Switch student', '', logout), field('out', 'Logout', '', logout))] }),
};
function renderPage() {
  const make = PAGES[view];
  if (!make || !me) return;
  const { title, body, foot, cls } = make();
  $('page').className = 'screen on ' + (cls || '');
  $('page-title').textContent = title && t(title);
  $('page-body').replaceChildren(...body);
  $('page-foot').replaceChildren(...(foot ? [foot] : []));
}

function initShell() {
  setTimeout(() => $('splash').remove(), reducedMotion.matches ? 600 : 1500);
  for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => go(b.dataset.go);
  for (const b of document.querySelectorAll('[data-soon]')) b.onclick = soon;
  for (const b of document.querySelectorAll('[data-back]')) { b.onclick = back; }
  $('open-menu').onclick = openMenu;
  $('shade').onclick = () => { closeMenu(); closeDialog(); };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeDialog(); } });
  $('q').oninput = renderWhere;
  $('set-map').onclick = () => go('pickup');
  $('locate').onclick = () => setPick(me.profile.hood);
  $('parea').onclick = () => pick('Choose an area', cfg.hoods.map((h) => [h.id, h.name]), pickHood, setPick);
  $('pconfirm').onclick = confirmPickup;
}
function rerenderShell() { // language change
  for (const b of document.querySelectorAll('[data-back]')) b.ariaLabel = t('Back');
  $('open-menu').ariaLabel = t('Menu'); $('open-bell').ariaLabel = t('Notification');
  $('locate').ariaLabel = t('My area'); $('parea').ariaLabel = t('Choose an area');
  if (!me || !lastCheck) return;
  if (view === 'launch') renderLaunch();
  if (view === 'where') renderWhere();
  if (view === 'pickup') setPick(pickHood, false);
  if (!SCREENS.includes(view)) renderPage();
  if ($('drawer').classList.contains('on')) renderMenu();
}
