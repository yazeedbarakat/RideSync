'use strict';
const $ = (id) => document.getElementById(id);
let cfg, me, map, layer, meetMarker, rideLayer, carMarker, seq = 0;
// Simulated clock: runs per visitor, holds until a driver accepts so the demo can't expire.
let simNow = 0, lastFrame = 0, lastMinute = -1, running = false;
let ready = false, offeredRide = null, joinedRide = null; // ready: the trip form is filled in
let playing = false; // after a driver accepts, the clock waits for "Play the trip"
let rideNote = '', balance = 0, lastPoll = 0, polling = false, chatSeq = 0, driverOffer = null;
let plan = null, reserved = null, editWeek = false, planSeq = 0, fromPrice = null;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const LIVE = ['OPEN', 'READY_CHECK', 'DISPATCHED', 'ACCEPTED', 'IN_PROGRESS'];
const hhmm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m) % 60).padStart(2, '0');
const toMin = (s) => s.split(':').reduce((h, m) => h * 60 + Number(m), 0);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Build DOM nodes with textContent only, so no server string is ever parsed as HTML.
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null && k !== false));
  return n;
}
function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}
const store = {
  get() { try { return JSON.parse(localStorage.getItem('ridesync')); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem('ridesync', JSON.stringify(v)) : localStorage.removeItem('ridesync'); } catch { /* private mode */ } },
};

async function api(path, body) {
  const opt = { headers: {} };
  if (me) opt.headers['X-Session'] = me.session;
  if (body !== undefined) {
    opt.method = 'POST';
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  let r;
  try { r = await fetch(path, opt); } catch { throw new Error("Can't reach RideSync. Check your connection and try again."); }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { if (me) logout(); throw new Error('Please sign in again'); }
  if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
  return data;
}
const rideUrl = (action = '') => `api/rides/${encodeURIComponent(joinedRide.id)}${action && '/' + action}`;

// --- Login ---
async function login(body) {
  $('login-error').textContent = '';
  try {
    me = null;
    me = await api('api/login', body);
    store.set(me);
    await openHome();
  } catch (e) { $('login-error').textContent = e.message; }
}
function logout() {
  me = null; store.set(null); seq++;
  running = false; joinedRide = null;
  $('login-error').textContent = '';
  ready = false; offeredRide = null; reserved = null; account = {}; dest = null;
  go('login');
}

// --- Home ---
async function openHome() {
  showMe();
  $('lecture').value = me.profile.lecture;
  $('hood').value = me.profile.hood;
  $('campus').value = 'JUST';
  if (!map) initMap();
  map.invalidateSize();
  go('launch');
  await restartClock();
}

function showMe() {
  $('hello').textContent = me.profile.first_name;
  $('me-av').textContent = me.profile.first_name[0];
}

function marker(latlng, cls, kids, extra = {}) {
  const node = el('div', { className: 'mk ' + cls }, ...kids);
  return L.marker(latlng, { icon: L.divIcon({ className: '', iconSize: [0, 0], html: node }), ...extra });
}

function initMap() {
  map = L.map('map', { zoomControl: false, zoomSnap: 0.25 }).setView([32.53, 35.92], 11);
  baseMap(map);
  layer = L.layerGroup().addTo(map);
}

// --- Clock and moving car ---
async function restartClock() {
  running = false;
  try { await api('api/demo/reset', {}); } catch (e) { // offline: carry on; session gone (e.g. server restarted): quietly back to login
    if (!me) return;
  }
  simNow = cfg.clock.start; lastMinute = -1; lastFrame = 0; joinedRide = null; playing = false; balance = 0;
  reserved = null; plan = null; editWeek = false; driverOffer = null;
  $('clock').textContent = hhmm(simNow);
  await refresh();
  $('sheet').scrollTop = 0;
  if (me && !running) { running = true; requestAnimationFrame(frame); }
}
function frame(ts) {
  if (!running) return;
  // A hidden tab catches up only while the trip plays.
  const dt = lastFrame ? Math.min((ts - lastFrame) / 1000, playing ? Infinity : 0.5) : 0;
  lastFrame = ts;
  const k = cfg.clock;
  const limit = k.start + (playing ? k.run : k.hold_after);
  if (simNow < limit) simNow = Math.min(limit, simNow + dt * (playing ? k.speed_joined : k.speed));
  const minute = Math.floor(simNow);
  if (!reducedMotion.matches || minute !== lastMinute) moveCar();
  if (minute !== lastMinute) { lastMinute = minute; onMinute(); }
  if (joinedRide && LIVE.includes(joinedRide.state) && !polling && ts - lastPoll > 1200) poll(ts);
  requestAnimationFrame(frame);
}
function onMinute() {
  $('clock').textContent = hhmm(simNow);
  if (joinedRide) updateJoined();
}
function positionAt(track, t) { // mirrors position_at in app/geo.py
  if (t <= track[0][0]) return track[0].slice(1);
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (t <= b[0]) {
      const f = (t - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return track[track.length - 1].slice(1);
}
function moveCar() {
  if (carMarker && joinedRide) carMarker.setLatLng(positionAt(joinedRide.track, simNow));
}
const currentTrip = () => ({ hood: $('hood').value, lecture: $('lecture').value, campus: $('campus').value });

async function refresh() {
  if (!$('lecture').value) return;
  seq++; // drop responses that arrive after this change
  const trip = currentTrip();
  joinedRide = null; // changing the trip leaves the joined-ride view
  offeredRide = null; playing = false; rideNote = ''; driverOffer = null;
  $('ride').replaceChildren(); $('ride').className = '';
  hideChat();
  ready = true;
  fromPrice = null;
  showBook(trip);
  drawMap(trip);
  loadPlan();
  loadPrice(trip);
}
async function loadPrice(trip) {
  const mine = seq;
  if (!cfg.sync_campuses.includes(trip.campus)) return;
  try {
    const [p, who] = await Promise.all([api(`api/price?hood=${trip.hood}&lecture=${trip.lecture}&campus=${trip.campus}`), api('api/me')]);
    if (mine !== seq) return;
    fromPrice = p.from; balance = who.balance;
    showBook(trip);
  } catch { /* the button works without the price */ }
}

function drawMap(trip, fit = true) {
  layer.clearLayers(); meetMarker = null; rideLayer = null; carMarker = null;
  const h = cfg.hoods.find((x) => x.id === trip.hood);
  marker([h.lat, h.lon], 'mk-me', [], { interactive: false }).addTo(layer);
  const c = cfg.campuses[trip.campus];
  marker([c.lat, c.lon], 'mk-campus', [icon('pin'), c.name.replace(' University', '')], { interactive: false }).addTo(layer);
  drawRide();
  updateShell();
  if (fit && map.getSize().x) map.fitBounds([[h.lat, h.lon], [c.lat, c.lon]], { paddingTopLeft: [44, 88], paddingBottomRight: [44, 92], maxZoom: 14 });
}

function drawRide() { // meeting point and road path of the offered or joined ride
  if (rideLayer) rideLayer.remove();
  rideLayer = null; meetMarker = null; carMarker = null;
  const ride = joinedRide || offeredRide;
  if (!ride) return;
  rideLayer = L.layerGroup().addTo(layer);
  L.polyline(ride.track.map((p) => p.slice(1)), { color: '#EE018D', weight: 4, opacity: 0.9, dashArray: '2 8' }).addTo(rideLayer);
  meetMarker = marker([ride.pickup.lat, ride.pickup.lon], 'mk-meet', [icon('pin')], { zIndexOffset: 400 }).addTo(rideLayer);
  if (joinedRide) carMarker = marker(positionAt(ride.track, simNow), 'mk-car', [icon('car')], { zIndexOffset: 600 }).addTo(rideLayer);
}

const balanceLine = () => (balance ? el('p', { className: 'line' }, icon('wallet'), t('Outstanding balance {price}: added to your next booking', { price: money(balance) })) : null);

function showBook(trip) { // the booking button, until a ride is on screen
  updateShell();
  const s = $('status');
  if (offeredRide || joinedRide) { s.replaceChildren(); return; }
  if (!cfg.sync_campuses.includes(trip.campus)) { s.replaceChildren(el('p', { className: 'sub', textContent: 'Shared rides go to JUST for now.' })); return; }
  if (toMin(trip.lecture) <= simNow) { s.replaceChildren(el('p', { className: 'sub', textContent: 'That time has already passed.' })); return; }
  const btn = el('button', { className: 'primary', textContent: fromPrice ? t('Sync a ride, about {price} each', { price: money(fromPrice) }) : 'Sync a ride' });
  btn.onclick = () => sync(trip, btn);
  s.replaceChildren(...[el('h3', { textContent: 'Share one car, split one fare' }),
    el('p', { className: 'sub', textContent: t('Up to {n} riders of your gender going your way', { n: cfg.max_riders }) }), balanceLine(), btn].filter(Boolean));
}

// --- Sync a ride ---
async function sync(trip, control) {
  const mine = ++seq;
  if (control) control.disabled = true;
  const box = $('ride');
  try {
    const r = await api('api/rides/match', { ...trip, now: hhmm(simNow) });
    if (mine !== seq) return;
    const first = !box.children.length;
    rideNote = '';
    if (r.balance !== undefined) balance = r.balance;
    showRide(r.ride, trip);
    if (first) {
      box.classList.add('in');
      box.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
    }
  } catch (e) {
    if (mine === seq) { box.className = 'plain'; box.replaceChildren(el('p', { className: 'error', textContent: e.message })); }
  } finally { if (control) control.disabled = false; }
}

const genderLine = () => el('p', { className: 'line' }, icon('shield'),
  me.profile.gender === 'F' ? 'Women only: every rider in this car is a woman' : 'Men only: every rider in this car is a man');

function riders(ride) {
  const names = ['You', ...ride.others.map((o) => o.name)];
  const seats = names.map((n, i) => el('span', { className: 'av v' + i, textContent: (i ? n : me.profile.first_name)[0] }));
  for (let i = names.length; i < cfg.max_riders; i++) seats.push(el('span', { className: 'av free', textContent: '' }));
  const tickFor = (i) => ride.state === 'READY_CHECK' && (i ? ride.others[i - 1].ready : ride.ready_check && ride.ready_check.me);
  return el('div', { className: 'crew' }, el('div', { className: 'avs', ariaHidden: 'true' }, ...seats),
    el('ul', { className: 'riders' }, ...names.map((n, i) => el('li', { className: tickFor(i) ? 'is-ready' : '' }, n, tickFor(i) ? icon('check') : null))));
}

function ticketTop(ride, title, badge) {
  const car = el('span', { className: 'car' }, icon('car'));
  return el('div', { className: 't-top' },
    el('h3', { className: 't-title' }, badge ? el('span', { className: 'badge' }, icon('check')) : null, el('span', { id: 't-text', textContent: title })),
    el('div', { className: 'leg' },
      el('div', {}, el('b', { textContent: ride.depart }), el('small', { textContent: 'Pickup' })),
      el('div', { className: 'road' }, car),
      el('div', {}, el('b', { textContent: ride.arrive }), el('small', { textContent: ride.campus }))));
}
const pickupLine = (ride) => el('p', { className: 'line' }, icon('walk'),
  t('{label}, about {n} m walk', { label: tPickup(ride.pickup.label), n: ride.pickup.walk_m }));

const priceLine = (ride, text) => el('div', { className: 'price' }, el('b', {}, money(ride.share)), el('span', { textContent: text }));
const fareText = (ride) => t('each. One fare of {fare} split by {n}.', { fare: money(ride.fare), n: ride.riders });
const noteLine = (text) => (text ? el('p', { className: 'notice', role: 'status', textContent: text }) : null);

function showRide(ride, trip) {
  const box = $('ride');
  offeredRide = ride;
  drawRide();
  showBook(trip); // hides the Sync button, or brings it back
  if (!ride) {
    box.className = 'plain';
    box.replaceChildren(el('h3', { textContent: 'No match yet' }),
      el('p', { className: 'sub', textContent: t('No group of {n}+ riders nearby for this time yet', { n: cfg.min_riders }) }));
    return;
  }
  box.className = '';
  const join = el('button', { className: 'primary', textContent: t('Join for {price}', { price: money(ride.share) }) });
  const err = el('p', { className: 'error', role: 'alert' });
  join.onclick = async () => {
    const mine = ++seq; // ignore the reply if the trip changes meanwhile
    join.disabled = true; err.textContent = '';
    try {
      const r = await api(`api/rides/${encodeURIComponent(ride.id)}/join`, { now: hhmm(simNow) });
      if (mine !== seq) return;
      joinedRide = r.ride; rideNote = ''; playing = false; balance = 0; chatSeq = 0;
      showChat(r.chat);
      showJoined();
    } catch (e) { err.textContent = e.message; join.disabled = false; }
  };
  box.replaceChildren(
    ticketTop(ride, t('{n} riders going your way', { n: ride.others.length })),
    el('div', { className: 'perf' }),
    el('div', { className: 't-body' },
      noteLine(ride.earlier_min ? t('No car fits your exact time. This one arrives {n} min earlier.', { n: ride.earlier_min }) : ''),
      riders(ride), pickupLine(ride), genderLine(),
      priceLine(ride, fareText(ride)),
      el('p', { className: 'sub', textContent: t('Riding alone would cost {solo}. Leaving is free until a driver accepts, and until {n} min before pickup after that.', { solo: money(ride.solo), n: cfg.late_leave_min }) }),
      balanceLine(), join, err));
}

// --- Joined ride, by state ---
const TITLES = {
  OPEN: (r) => t('You\'re in. Be ready by {t}', { t: r.depart }),
  READY_CHECK: () => 'Ready check',
  DISPATCHED: () => 'Finding your driver',
  ACCEPTED: (r) => t('{name} picks you up at {t}', { name: r.driver.name, t: r.depart }),
  IN_PROGRESS: () => 'On your way',
  COMPLETED: (r) => t('Arrived at {campus}', { campus: r.campus }),
  CANCELED: () => 'Ride cancelled',
};
function button(text, fn, cls = 'primary', ic) {
  const b = el('button', { className: cls }, ic ? icon(ic) : null, text);
  b.onclick = fn;
  return b;
}
function showJoined(scroll = true) {
  const ride = joinedRide, box = $('ride');
  chatLock();
  if (ride.state === 'COMPLETED') { showSummary(); return; }
  box.className = 'confirmed in';
  const err = el('p', { className: 'error', role: 'alert' });
  const act = (name, body = {}) => rideAction(name, body, err);
  const last = ride.others.length ? ride.others[ride.others.length - 1].name : null;
  const demo = [];
  if (last && LIVE.slice(0, 4).includes(ride.state)) demo.push(button(t('Demo: {name} leaves', { name: last }), () => act('dropout'), 'quiet demo'));
  if (ride.state === 'ACCEPTED' && simNow < toMin(ride.late_from)) {
    demo.push(button(t('Demo: skip to {t}', { t: hhmm(toMin(ride.late_from) + 5) }), () => { simNow = toMin(ride.late_from) + 5; lastMinute = -1; lastPoll = 0; }, 'quiet demo'));
  }
  if (['ACCEPTED', 'IN_PROGRESS'].includes(ride.state)) demo.push(button('Demo: complete trip', () => act('complete'), 'quiet demo'));
  const leave = LIVE.slice(0, 4).includes(ride.state)
    ? button(ride.leave_cost ? t('Leave ride ({price})', { price: money(ride.leave_cost) }) : 'Leave ride (free)', () => confirmLeave(err), 'quiet') : null;

  const body = [noteLine(rideNote), riders(ride), pickupLine(ride), genderLine()];
  if (ride.state === 'OPEN') {
    body.push(priceLine(ride, fareText(ride)), savedLine(ride),
      el('p', { className: 'sub', textContent: t('Joining stays open until {t}. Tap Find driver when your group is set.', { t: ride.join_closes }) }),
      button('Find driver', () => act('find-driver'), 'primary', 'car'));
  } else if (ride.state === 'READY_CHECK') {
    const answered = ride.ready_check.me;
    body.unshift(el('div', { className: 'ready' }, el('b', { textContent: answered ? 'Waiting for the others' : 'Are you ready?' }),
      el('span', { textContent: t('Pickup at {t} is now final. No answer by {e} counts as ready.', { t: ride.depart, e: ride.ready_check.ends }) }),
      answered ? null : el('div', { className: 'acts wide' }, button("I'm ready", () => act('ready', { ready: true }), 'primary', 'check'),
        button('Cancel ride for me', () => act('ready', { ready: false }), 'quiet'))));
    body.push(priceLine(ride, fareText(ride)));
  } else if (ride.state === 'DISPATCHED') {
    body.push(el('p', { className: 'sub', textContent: t('Your pickup at {t} is final. Joining is closed.', { t: ride.depart }) }),
      priceLine(ride, fareText(ride)), button("Demo: open the driver's app", openDriver, 'ghost', 'car'));
  } else if (ride.state === 'ACCEPTED' || ride.state === 'IN_PROGRESS') {
    body.splice(1, 0, el('div', { className: 'driver' }, el('span', { className: 'av v3', textContent: ride.driver.name[0] }),
      el('span', {}, el('b', { textContent: ride.driver.name }), el('small', { textContent: ride.driver.car + ' · ' + ride.driver.plate }))));
    body.push(priceLine(ride, t('cash to the driver at drop-off. {n} riders.', { n: ride.riders })), savedLine(ride),
      ride.state === 'ACCEPTED' && !playing ? button('Play the trip', () => { playing = true; showJoined(false); }, 'primary', 'play') : null,
      ride.state === 'ACCEPTED' && !ride.leave_cost ? el('p', { className: 'sub', textContent: t('Leaving is free until {t}. After that you pay your own share.', { t: ride.late_from }) }) : null,
      button("Demo: open the driver's app", openDriver, 'ghost', 'car'));
  } else if (ride.state === 'CANCELED') {
    body.push(noteLine(ride.cancel_reason), button('Sync again', () => refresh(), 'primary'));
  }
  if (ride.balance_added) body.push(el('p', { className: 'line' }, icon('wallet'), t('Plus your outstanding balance of {price}', { price: money(ride.balance_added) })));
  body.push(el('div', { className: 'acts', id: 'acts' }, leave, ...demo), err);
  box.replaceChildren(ticketTop(ride, TITLES[ride.state](ride), ride.state !== 'CANCELED'), el('div', { className: 'perf' }), el('div', { className: 't-body' }, ...body));
  drawRide();
  updateJoined();
  if (scroll) $('sheet').scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}
const savedLine = (ride) => el('div', { className: 'save' },
  el('div', {}, el('b', { textContent: money(ride.saved) }), t('saved vs. riding alone ({price})', { price: money(ride.solo) })));

function showSummary() {
  const s = joinedRide.summary, box = $('ride');
  box.className = 'confirmed in';
  box.replaceChildren(ticketTop(joinedRide, TITLES.COMPLETED(joinedRide), true), el('div', { className: 'perf' }), el('div', { className: 't-body' },
    el('div', { className: 'summary' },
      el('div', {}, el('small', { textContent: 'Arrived' }), el('b', { textContent: s.arrived })),
      el('div', {}, el('small', { textContent: 'You paid (cash)' }), el('b', { textContent: money(s.paid) })),
      el('div', {}, el('small', { textContent: 'Shared by' }), el('b', { textContent: t('{n} riders', { n: s.riders }) })),
      el('div', {}, el('small', { textContent: 'Saved vs. alone' }), el('b', { textContent: money(s.saved) }))),
    el('p', { className: 'line' }, icon('car'), s.credit
      ? t('{name} got {cash} cash + {credit} credit = {total}', { name: s.driver, cash: money(s.cash), credit: money(s.credit), total: money(s.driver_total) })
      : t('{name} got {cash} cash', { name: s.driver, cash: money(s.cash) })),
    button('Book another ride', () => restartClock(), 'quiet')));
  updateShell();
}

async function rideAction(name, body, err) {
  const mine = seq, before = joinedRide;
  err.textContent = '';
  $('ride').querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const r = await api(rideUrl(name), { ...body, now: hhmm(simNow) });
    if (mine !== seq) return;
    if (r.status === 'left') { afterLeave(r); return; }
    if (r.left) rideNote = r.replacement ? t('{a} left. {b} took the seat, so nothing changes for you.', { a: r.left.name, b: r.replacement })
      : r.left.late ? t('{a} left late and pays their own share, so yours stays {price}.', { a: r.left.name, price: money(r.ride.share) })
        : t('{a} left. With {n} riders your share is {price}.', { a: r.left.name, n: r.ride.riders, price: money(r.ride.share) });
    else if (r.ride.state !== before.state) rideNote = '';
    took(r);
  } catch (e) { err.textContent = e.message; $('ride').querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
}
function took(r) { // apply a server reply: ride and any new chat messages
  joinedRide = r.ride;
  if (r.chat) addChat(r.chat);
  if (!LIVE.includes(joinedRide.state)) playing = false;
  showJoined(false);
}
function confirmLeave(err) {
  const ride = joinedRide;
  const text = ride.leave_cost
    ? t("It's less than {n} min before pickup and a driver is on the way, so you'll pay your share: {price}. It's added to your next booking, and the others don't pay more.", { n: cfg.late_leave_min, price: money(ride.leave_cost) })
    : 'Leaving now is free.';
  dialog(ride.leave_cost ? t("You'll pay your share: {price}", { price: money(ride.leave_cost) }) : 'Leave this ride?',
    [el('p', { className: 'txt', textContent: text })], () => rideAction('leave', {}, err));
}
function afterLeave(r) {
  const ride = joinedRide;
  joinedRide = null; offeredRide = null; playing = false; hideChat();
  if (r.charge) balance += r.charge;
  drawRide();
  showBook(currentTrip());
  $('ride').className = 'plain';
  $('ride').replaceChildren(noteLine(r.late ? t('You left this ride. {price} is added to your next ride.', { price: money(r.charge) })
    : t('You left the {t} ride. No charge.', { t: ride.depart })));
}

async function poll(ts) { // ready answers, driver, state changes and new chat
  lastPoll = ts; polling = true;
  const ride = joinedRide, mine = seq;
  try {
    const r = await api(rideUrl() + `?now=${hhmm(simNow)}&after=${chatSeq}`);
    if (mine !== seq || joinedRide !== ride) return;
    if (r.chat.length) addChat(r.chat);
    const strip = (x) => JSON.stringify({ ...x, track: 0 });
    if (strip(r.ride) !== strip(ride)) {
      if (r.ride.state !== ride.state) rideNote = '';
      joinedRide = r.ride;
      if (!LIVE.includes(joinedRide.state)) playing = false;
      showJoined(false);
    }
  } catch { /* offline: the next poll retries */ } finally { polling = false; }
}
function updateJoined() { // runs every simulated minute: car only, no rebuild
  updateShell();
  const ride = joinedRide, go = toMin(ride.depart), end = toMin(ride.arrive);
  const car = $('ride').querySelector('.car');
  if (car) car.style.insetInlineStart = Math.max(0, Math.min(100, ((simNow - go) / (end - go)) * 100)) + '%';
}

// --- Group chat ---
function showChat(messages) {
  const box = $('chat');
  const list = el('ul', { className: 'msgs', id: 'msgs' });
  const input = el('input', { id: 'say', maxLength: cfg.chat_max, placeholder: 'Message your group', autocomplete: 'off', dir: 'auto', ariaLabel: 'Message your group' });
  const err = el('p', { className: 'error', role: 'alert' });
  const form = el('form', { className: 'say' }, input, el('button', { className: 'small', textContent: 'Send' }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !joinedRide) return;
    err.textContent = '';
    try {
      const r = await api(rideUrl('chat'), { text, after: chatSeq });
      input.value = '';
      addChat(r.chat);
    } catch (ex) { err.textContent = ex.message; }
  };
  box.replaceChildren(el('h3', { textContent: 'Group chat' }),
    el('p', { className: 'sub', textContent: 'First names only. Phone numbers and links are hidden.' }), list, form, err);
  box.hidden = false;
  addChat(messages);
}
function addChat(messages) {
  const list = $('msgs');
  if (!list) return;
  for (const m of messages) {
    if (m.seq <= chatSeq) continue;
    chatSeq = m.seq;
    const mine = m.who === me.profile.first_name;
    list.append(m.who ? el('li', { className: mine ? 'me' : '' }, mine ? null : el('b', { textContent: m.who }), el('span', { textContent: m.text, dir: 'auto' }))
      : el('li', { className: 'sys', textContent: m.text }));
  }
  list.scrollTop = list.scrollHeight;
  chatLock();
}
function chatLock() { // read-only once the trip is over
  const done = joinedRide && ['COMPLETED', 'CANCELED'].includes(joinedRide.state);
  const say = $('say');
  if (say) { say.disabled = done; say.placeholder = done ? 'This chat is read-only now' : 'Message your group'; }
}
function hideChat() { $('chat').hidden = true; $('chat').replaceChildren(); chatSeq = 0; }

// --- Driver's app (demo) ---
async function openDriver() {
  try { driverOffer = await api(rideUrl('offer') + `?now=${hhmm(simNow)}`); go('driver'); } catch (e) { toast(e.message); }
}
async function driverAnswer(accept, err) {
  try {
    const r = await api(rideUrl('driver'), { accept, now: hhmm(simNow) });
    driverOffer = r.offer;
    took(r);
    if (accept) { back(); toast(t('{name} accepted your ride', { name: r.ride.driver.name })); } else renderPage();
  } catch (e) { err.textContent = e.message; }
}

// --- Tomorrow ---
const weekKey = () => `ridesync-week-${me.profile.first_name}`;
function week() {
  try {
    const w = JSON.parse(localStorage.getItem(weekKey()));
    if (Array.isArray(w) && w.length === DAYS.length) return w;
  } catch { /* fall through to the default */ }
  return DAYS.map(() => me.profile.lecture);
}
const tomorrow = () => (cfg.dow + 1) % DAYS.length;
async function loadPlan() {
  const mine = ++planSeq, lecture = week()[tomorrow()];
  plan = null;
  if (lecture) {
    try {
      const r = await api('api/plan', { hood: $('hood').value, campus: $('campus').value, lecture });
      if (mine !== planSeq) return;
      plan = r;
    } catch { if (mine !== planSeq) return; }
  }
  if (me) showPlan();
}
function showPlan() {
  const box = $('plan'), lecture = week()[tomorrow()];
  const edit = el('button', { className: 'quiet', textContent: editWeek ? 'Done' : 'Edit week' });
  edit.onclick = () => { editWeek = !editWeek; showPlan(); };
  const kids = [el('div', { className: 'planhead' }, el('h3', { textContent: t('Tomorrow, {day}', { day: DAYS[tomorrow()] }) }),
    lecture && !editWeek ? el('span', { className: 'tag', textContent: t('Arrive by {t}', { t: lecture }) }) : null, edit)];
  if (editWeek) {
    const rows = DAYS.map((d, i) => {
      const input = el('input', { type: 'time', value: week()[i] || '' });
      input.onchange = () => {
        const w = week();
        w[i] = input.value;
        try { localStorage.setItem(weekKey(), JSON.stringify(w)); } catch { /* private mode */ }
        if (i === tomorrow() && !reserved) loadPlan();
      };
      return el('label', {}, d, input);
    });
    kids.push(el('p', { className: 'sub', textContent: 'Arrival time each day' }), el('div', { className: 'week' }, ...rows));
  }
  if (!lecture) kids.push(el('p', { className: 'sub', textContent: 'No time set for tomorrow.' }));
  else if (plan && (cfg.sync_campuses.includes($('campus').value) || reserved)) {
    const ride = reserved || plan.ride;
    const err = el('p', { className: 'error', role: 'alert' });
    let btn = null;
    if (ride) {
      btn = el('button', { className: reserved ? 'quiet' : 'small', textContent: reserved ? 'Cancel' : 'Reserve' });
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await api(`api/rides/${encodeURIComponent(ride.id)}/${reserved ? 'leave' : 'join'}`, {});
          if (reserved) { reserved = null; loadPlan(); } else { reserved = ride; showPlan(); }
        } catch (e) { err.textContent = e.message; btn.disabled = false; }
      };
    }
    kids.push(el('div', { className: 'opt us' + (reserved ? ' done' : '') }, icon(reserved ? 'check' : 'car'), el('div', {},
      el('b', { textContent: ride ? t('Shared ride at {t}, {price} each', { t: ride.depart, price: money(ride.share) }) : 'No shared ride matches this time yet' }),
      ride ? el('small', { textContent: reserved ? 'Seat reserved. Free to cancel.' : t('Arrives {t}', { t: ride.arrive }) }) : null), btn), err);
  }
  box.replaceChildren(...kids);
}

function fillSelects() {
  const keep = [$('hood').value, $('campus').value];
  $('hood').replaceChildren(...cfg.hoods.map((h) => el('option', { value: h.id, textContent: h.name })));
  $('campus').replaceChildren(...Object.entries(cfg.campuses).map(([id, c]) => el('option', { value: id, textContent: c.name })));
  if (keep[0]) [$('hood').value, $('campus').value] = keep;
}

async function start() {
  try { cfg = await api('api/config'); } catch (e) { $('splash').remove(); show('login'); $('login-error').textContent = e.message; return; }
  initShell(); fillSelects();
  for (const id of ['lecture', 'hood', 'campus']) $(id).addEventListener('change', refresh);
  $('logout').onclick = logout;
  $('restart').onclick = () => { restartClock(); };
  $('signup-form').onsubmit = (e) => {
    e.preventDefault();
    const g = document.querySelector('input[name="gender"]:checked');
    login({ first_name: $('first-name').value, gender: g && g.value });
  };
  document.querySelectorAll('[data-demo]').forEach((b) => { b.onclick = () => login({ demo: b.dataset.demo }); });
  new ResizeObserver(() => map && map.invalidateSize()).observe($('map'));
  me = store.get();
  if (me && me.session && me.profile) await openHome(); else { me = null; go('login'); }
}
start();
