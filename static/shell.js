'use strict';
// The Jeeny-style app around Sync: screens, menu and the simple pages. Uses helpers from app.js.
// Nothing here is stored or sent: account choices live in memory and no real payment exists.
let view = '', pmap = null, pickHood = null, dest = null, cat = 'My Locations', account = {};
const ROOTS = ['login', 'launch'];
const SCREENS = ['login', 'launch', 'where', 'pickup', 'home'];
// Places outside the pilot are listed like in the app, but only campuses can be booked here.
const PLACES = {
  University: [{ name: 'JUST', sub: 'Jordan University of Science and Technology', campus: 'JUST' }, { name: 'Yarmouk University', sub: 'Irbid', campus: 'YU' }],
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
  if (name === 'home' && map) { map.invalidateSize(); if (ready) drawMap(currentTrip()); }
}
function go(name, replace = ROOTS.includes(name)) {
  if (name === view) { closeMenu(); return; }
  if (name === 'where') { cat = 'My Locations'; $('q').value = ''; }
  if (name === 'pickup') dest = $('campus').value; // choose() overrides this
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
const campusName = (id) => t(cfg.campuses[id].name);
const hoodName = (id) => t(cfg.hoods.find((h) => h.id === id).name);
function renderAlert() { // today's booked ride
  $('alert').hidden = !joinedRide || !LIVE.includes(joinedRide.state);
  if ($('alert').hidden) return;
  const body = [icon('check'), el('span', {}, el('b', { textContent: t('Your Sync ride leaves at {t}', { t: joinedRide.depart }) }),
    el('small', { textContent: t('Arrives {t}', { t: joinedRide.arrive }) + ' · ' + money(joinedRide.share) })), icon('next')];
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
  go('pickup');
  dest = p.campus;
  setPick(pickHood, false);
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
    baseMap(pmap);
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
  $('pname').textContent = t('Near {place}', { place: h.name }) + ', Irbid';
  $('pto').textContent = t('To {place}', { place: campusName(dest) });
}
function confirmPickup() {
  const changed = $('hood').value !== pickHood || $('campus').value !== dest;
  $('hood').value = pickHood; $('campus').value = dest;
  go('home', true);
  if (changed) refresh(); // the same trip keeps any joined ride
}

// --- Menu ---
function renderMenu() {
  $('me-uni').textContent = me.profile.gender === 'F' ? 'Rides with women only' : 'Rides with men only';
  const items = MENU.map(([to, ic, name, tag]) => {
    const n = to === 'notes' ? notes().length : 0;
    const b = el('button', {}, icon(ic), el('span', {}, t(name), tag || n ? el('em', { textContent: n || t(tag) }) : null), icon('next'));
    b.lastChild.classList.add('flip');
    b.onclick = () => go(to);
    return b;
  });
  $('menu').replaceChildren(...items);
}

// --- Simple pages ---
const notes = () => { // only things that really happened in this session
  const out = [];
  if (joinedRide && LIVE.includes(joinedRide.state)) out.push([t('Your Sync ride leaves at {t}', { t: joinedRide.depart }), t('{label}, about {n} m walk', { label: tPickup(joinedRide.pickup.label), n: joinedRide.pickup.walk_m }), 'home']);
  if (balance) out.push([t('Outstanding balance {price}', { price: money(balance) }), 'Added to your next booking', 'home']);
  if (reserved) out.push([t('Seat reserved'), t('Tomorrow, {day}', { day: t(DAYS[tomorrow()]) }) + ' · ' + reserved.depart, 'home']);
  return out;
};
const STATE_NAMES = { OPEN: 'Joined', READY_CHECK: 'Ready check', DISPATCHED: 'Finding driver', ACCEPTED: 'Driver on the way', IN_PROGRESS: 'On the way', COMPLETED: 'Completed', CANCELED: 'Cancelled' };
function rideRows() {
  const rows = [];
  if (joinedRide) rows.push(['Today', joinedRide.campus, joinedRide.depart, joinedRide.share, STATE_NAMES[joinedRide.state]]);
  if (reserved) rows.push(['Tomorrow', reserved.campus, reserved.depart, reserved.share, 'Reserved']);
  return rows;
}
function rideItem([, to, time, price, state]) {
  return row('car', t('To: {place}', { place: t(to) }), '', () => (state === 'Completed' ? choose(PLACES.University[0]) : go('home')),
    el('span', { className: 'rmeta' }, el('small', { textContent: time + ' · ' + money(price) }), el('small', { className: 'st', textContent: t(state) })));
}
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
  driver: () => {
    const o = driverOffer, err = el('p', { className: 'error', role: 'alert' });
    if (!o) return { title: "Driver's app", body: [p('No ride to show', 'txt mid')] };
    const open = o.state === 'DISPATCHED';
    const stops = o.stops.map((st, i) => el('div', { className: 'stop' }, el('span', { className: 'num', textContent: String(i + 1) }),
      el('span', {}, el('b', { textContent: st.label }), el('small', { textContent: st.kind === 'pickup' ? t('Pick up {names} · {t}', { names: st.names.map((n) => (n === 'You' ? me.profile.first_name : n)).join(', '), t: st.time }) : t('Drop off · about {t}', { t: st.time }) }))));
    const late = o.left.filter((l) => l.late);
    return { title: "Driver's app (demo)", cls: 'grey', body: [
      el('p', { className: 'lbl', textContent: open ? 'New trip offer' : t('Your trip · {state}', { state: STATE_NAMES[o.state] }) }),
      el('h1', { className: 'huge', textContent: open ? 'Shared Ride' : o.driver.name }),
      el('div', { className: 'plainlist' }, field('clock', 'First pickup', o.first_pickup), field('users', 'Riders', String(o.riders)),
        field('ticket', 'Full fare', money(o.fare)), field('wallet', 'Cash to collect', money(o.collect)),
        field('car', 'Trip', t('{km} km · ~{m} min', { km: o.km, m: o.minutes })), open ? field('bell', 'Respond by', o.respond_by) : null),
      ...late.map((l) => el('p', { className: 'notice', textContent: t('{name} cancelled. Collect {cash} cash · {credit} credit at trip end', { name: l.name, cash: money(o.collect), credit: money(o.credit) }) })),
      h2('Stops'), ...stops,
      p('One booking, one fare. Each rider pays their own share in cash at drop-off.', 'lbl'), err],
    foot: open ? el('div', { className: 'stack' }, button(t('Accept as {name}', { name: o.driver.name }), () => driverAnswer(true, err)), button('Reject', () => driverAnswer(false, err), 'quiet')) : null };
  },
  rides: () => ({ title: 'My Rides', body: [...new Set(rideRows().map((r) => r[0]))].flatMap((g) => [h2(g), el('ul', { className: 'places rides' }, ...rideRows().filter((r) => r[0] === g).map(rideItem))]) }),
  notes: () => ({ title: 'Notification', cls: 'grey', body: notes().length ? notes().map(([a, b, to]) => {
    const n = el('button', { className: 'notecard' }, el('b', { textContent: a }), el('span', { textContent: b }), el('em', { textContent: t('Open') }));
    n.onclick = () => go(to);
    return n;
  }) : [p('Nothing new yet', 'txt mid')] }),
  promos: () => ({ title: 'Promotions', body: [p('Planned for the pilot launch. Not active in this demo.'), ...[['First Sync ride free', 'For new students at JUST and Yarmouk'], ['Bring 3 friends', 'Fill a car with your classmates']].map(([a, b]) =>
    el('div', { className: 'notecard' }, el('b', { textContent: t(a) }), el('span', { textContent: t(b) }), el('em', { textContent: t('Planned') })))], foot: button('Book Now', () => go('where')) }),
  wallet: () => ({ title: 'My Wallet', cls: 'rosy', body: [el('div', { className: 'bal' }, p('Jeeny Balance', 'lbl'), el('strong', { textContent: money(0) }), icon('link'), button('Add funds', soon), p('This demo has no real payments.', 'lbl')),
    el('div', { className: 'lift' }, h2('Transaction History'), p('No transactions yet'))] }),
  cards: () => ({ title: '', cls: 'grey', body: [el('h1', { className: 'huge', textContent: t('My Cards') }), el('div', { className: 'between' }, p('Payment Method'), button('Add New', soon, 'link'))] }),
  invite: () => ({ title: 'Invite & Earn', cls: 'grey', body: [el('h1', { className: 'huge pinkish', textContent: t('Bring 3 friends') }), p('A fuller car means a cheaper seat for everyone.'), p('Share your invite code', 'lbl'),
    (() => { const b = el('button', { className: 'code' }, el('span', { textContent: 'SYNC-DEMO' }), icon('copy')); b.onclick = async () => { try { await navigator.clipboard.writeText('SYNC-DEMO'); toast('Copied'); } catch { soon(); } }; return b; })(),
    button('Share Now', soon)] }),
  about: () => ({ title: 'About Us', body: [h2('Who we are'), p('RideSync is a feature we propose for Jeeny: it fills one Jeeny car with riders of the same gender going the same way at the same time, and they split one fare.'),
    h2('How matching works'), tick('Same destination and arrival time'), tick('A short walk to one pickup point'), tick('Every rider has the same gender'), tick('Priced with the LTRC smart-app tariff, as one normal trip'), h2('Who built it'), p('Team 1337: five students of Computer Engineering, Artificial Intelligence and Computer Science from JUST, Al al-Bayt and Yarmouk.'), p('Built by team 1337 for Jeeny Next Stop (Jeeny x AAU, 2026). A student concept, not the official Jeeny app.'), p('All students and trips are simulated, and no real Jeeny system is connected.'), h2('Where we start'), p('First JUST and Yarmouk, then all of Irbid, then universities across Jordan. Shared rides start with JUST.'), p('Map data © OpenStreetMap contributors', 'lbl')] }),
  help: () => ({ title: 'Jeeny Help Center', body: [h2('Get help with recent rides'), el('ul', { className: 'places rides' }, ...rideRows().slice(0, 3).map(rideItem)), h2('Support'),
    el('div', { className: 'plainlist' }, field('mail', 'Support Inbox', '', soon), field('info', 'About', '', () => go('about')), field('help', 'Jeeny Handbook', '', soon)),
    h2('Sync questions'), faq('What does Sync cost?', 'One normal Jeeny fare for the trip, split between the riders. You see your share before you join.'), faq('Who rides with me?', 'Only riders of your gender. Gender is set when you sign up and can\'t be changed.'), faq('What if someone leaves?', 'Before the ready check a nearby rider can take the seat. Leaving is free until a driver accepts, and until 30 min before pickup after that. Later, the leaver pays their own share, so yours doesn\'t go up.')] }),
  max: () => ({ title: '', cls: 'rosy', body: [el('div', { className: 'maxlogo' }, icon('link'), 'MAX'), el('h1', { className: 'mid', textContent: 'Jeeny Core' }), el('div', { className: 'boxed' }, p('What we offer:'), tick('Cashback on rides'), tick('Cancellation fee refunds')),
    p('FAQs', 'lbl'), faq('What is Jeeny Core?', "It's Jeeny's own subscription, shown here only for context."), faq('Does Sync need a subscription?', 'No. Sync is pay per ride.')], foot: button('Subscribe Now', soon) }),
  account: () => ({ title: 'Jeeny Account', cls: 'acct', body: [el('div', { className: 'hero2' }, el('span', { className: 'sqav big', textContent: me.profile.first_name[0] }), el('b', { textContent: me.profile.first_name }), p('Jeeny rider', 'lbl')),
    el('div', { className: 'fields' }, field('user', 'Name', me.profile.first_name), field('pin', 'Area', hoodName(me.profile.hood)), field('wallet', 'Outstanding balance', money(balance))),
    el('div', { className: 'fields' }, field('users', 'Gender', me.profile.gender === 'F' ? 'Female' : 'Male'),
      field('cal', 'Date of Birth', account.dob, () => { const d = el('input', { type: 'date', value: account.dob || '', max: '2010-12-31', ariaLabel: t('Date of Birth') }); dialog('Date of Birth', [d], () => { account.dob = d.value; renderPage(); }); }),
      choice('school', 'Education', ['High School', 'Diploma', 'Undergraduate', 'Post Graduate']), choice('bag', 'Employment', ['Self-Employed', 'Private Company Employee', 'Public Sector Employee', 'Unemployed']), choice('users', 'Marital status', ['Single', 'Married'])),
    p('Gender is set when you sign up and can\'t be changed, so every car stays same-gender. Other answers stay on this screen and are not saved.', 'lbl pad'),
    el('div', { className: 'fields' }, field('sliders', 'Manage', '', () => go('manage')))] }),
  manage: () => ({ title: 'Jeeny Account', cls: 'acct', body: [el('div', { className: 'fields' }, field('swap', 'Switch account', '', logout), field('out', 'Logout', '', logout))] }),
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
