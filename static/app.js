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
  ready = false; offeredRide = null; reserved = null; account = {}; dest = null; booked = null; normalTrip = null;
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
  resetChat();
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
      joinedRide = r.ride; rideNote = ''; playing = false; balance = 0;
      resetChat(); addChat(r.chat);
      showJoined();
      go('ridescreen');
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

// --- Ride screen: map + status sheet, ported from NextStop web/src/screens/Status.tsx ---
const t12 = (s) => { const [h, m] = s.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const mmss = (sec) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;
const readyCount = (r) => (r.ready_check && r.ready_check.me ? 1 : 0) + r.others.filter((o) => o.ready).length;
const STAGE = { OPEN: 0, READY_CHECK: 1, DISPATCHED: 2, ACCEPTED: 3, IN_PROGRESS: 3 };
let rmap = null, rpins = null, sheetKind = null, leftSummary = null;

function button(text, fn, cls = 'primary', ic) {
  const b = el('button', { className: cls }, ic ? icon(ic) : null, text);
  b.onclick = fn;
  return b;
}
const initial = (name) => (name === 'You' ? me.profile.first_name : name)[0];
function avatar(name, size = 48, dot) {
  return el('div', { className: 'avatar', style: `width:${size}px;height:${size}px;font-size:${size * 0.36}px;border-radius:${size <= 32 ? 10 : 12}px` }, initial(name),
    dot ? el('span', { className: 'status-dot ' + dot }, dot === 'ready' ? icon('check') : null) : null);
}
function seatRow(ride, size = 48) { // NextStop SeatRow: 4 slots
  const closed = ride.state !== 'OPEN', showReady = ride.state === 'READY_CHECK' && size >= 40;
  const names = ['You', ...ride.others.map((o) => o.name)];
  const slots = [];
  for (let i = 0; i < 4; i++) {
    if (i < names.length) {
      const ready = i ? ride.others[i - 1].ready : ride.ready_check && ride.ready_check.me;
      slots.push(el('div', { className: 'seat' }, avatar(names[i], size, showReady ? (ready ? 'ready' : 'waiting') : null)));
    } else {
      slots.push(el('div', { className: 'seat-empty' + (closed ? ' seat-closed' : ''), style: `width:${size}px;height:${size}px;border-radius:${size < 32 ? 8 : 12}px` }, closed ? null : icon('plus')));
    }
  }
  return el('div', { className: 'seat-row', style: `gap:${size < 32 ? 6 : 12}px` }, ...slots);
}
const arriveBy = () => $('lecture').value || cfg.default_lecture;

function showJoined() { // re-render whatever shows the joined ride
  chatLock();
  homeCard();
  if (view === 'ridescreen') renderRide();
  if (view === 'chatscreen') $('chat-seats').replaceChildren(seatRow(joinedRide, 24));
  updateShell();
}
function homeCard() { // on the booking screen: a link to the ride screen
  const ride = joinedRide, box = $('ride');
  if (!ride) return;
  box.className = 'plain in';
  box.replaceChildren(el('h3', { textContent: ride.state === 'COMPLETED' ? 'Your ride is done' : 'You have a shared ride' }),
    el('p', { className: 'sub', textContent: t('Pickup {t} · {price} each', { t: t12(ride.depart), price: money(ride.share) }) }),
    button('Open ride', () => go('ridescreen'), 'primary'));
}
function openRide() {
  if (!joinedRide && !leftSummary) { show('home'); return; }
  if (!rmap) {
    rmap = L.map('rmap', { zoomControl: false, attributionControl: true });
    baseMap(rmap);
    rpins = L.layerGroup().addTo(rmap);
  }
  rmap.invalidateSize();
  renderRide();
}
function drawRideMap(ride) { // rider map: only your own pickup and the destination (NextStop SPEC §3.14)
  rpins.clearLayers();
  const c = cfg.campuses[ride.campus];
  const p = [ride.pickup.lat, ride.pickup.lon], d = [c.lat, c.lon];
  L.circleMarker(p, { radius: 9, color: '#fff', weight: 2, fillColor: '#EE018D', fillOpacity: 1 }).addTo(rpins);
  L.circleMarker(d, { radius: 9, color: '#fff', weight: 2, fillColor: '#6B2D8F', fillOpacity: 1 }).addTo(rpins);
  rmap.fitBounds([p, d], { padding: [40, 40] });
  $('rpulse').hidden = !['OPEN', 'DISPATCHED'].includes(ride.state);
}

function renderRide() {
  const screen = $('ridescreen');
  $('rclock').textContent = t12(hhmm(simNow));
  if (leftSummary || !joinedRide || ['COMPLETED', 'CANCELED'].includes(joinedRide.state)) { renderSummary(); return; }
  screen.classList.remove('summary');
  const ride = joinedRide, n = ride.riders, stage = STAGE[ride.state];
  if (screen.dataset.state !== ride.state) { screen.dataset.state = ride.state; screen.querySelector('.scroll').scrollTop = 0; }
  const [title, sub] = ({
    OPEN: () => ['Waiting for riders', `${n} of 4 seats filled`],
    READY_CHECK: () => ['Ready check', `${readyCount(ride)} of ${n} ready · ${mmss((toMin(ride.ready_check.ends) - simNow) * 60)} left`],
    DISPATCHED: () => ['Finding your driver', 'Your ride is set'],
  }[ride.state] || (() => ['Driver on the way', `${ride.driver.name} · ${ride.driver.car} · ${ride.driver.plate.replace('-', '‑')}`]))();
  $('st-head').hidden = false;
  $('st-title').textContent = title;
  $('st-sub').textContent = sub;
  $('st-progress').replaceChildren(...[0, 1, 2, 3].map((i) => el('span', { className: (i <= stage ? 'on' : '') + (i === stage && stage < 3 ? ' now' : '') })));

  const lastMsg = chatLog[chatLog.length - 1];
  const chat = el('button', { className: 'card', id: 'chatcard' },
    el('div', { className: 'row' }, icon('chat'), el('span', { className: 'grow', textContent: 'Group chat' }),
      unread ? el('span', { className: 'badge', textContent: String(unread) }) : null, icon('next')),
    lastMsg ? el('div', { className: 'body muted truncate', textContent: (lastMsg.who ? `${lastMsg.who === me.profile.first_name ? 'You' : lastMsg.who}: ` : '') + lastMsg.text }) : null);
  chat.onclick = () => go('chatscreen');
  const leave = el('button', { className: 'card row leave' }, icon('nocar'), el('span', { textContent: 'Leave ride' }));
  leave.onclick = () => openSheet('leave');
  $('st-cards').replaceChildren(...[
    rideNote ? el('div', { className: 'card note', textContent: rideNote }) : null,
    el('div', { className: 'card' }, seatRow(ride),
      el('div', { className: 'body-l seatline' }, `${n} of 4 seats filled · `, el('span', { className: 'accent', textContent: money(ride.share) }), ' each')),
    chat,
    el('div', { className: 'card info' },
      el('div', { className: 'info-row lead' }, icon('clock'), el('span', { className: 'val', textContent: t('Be ready by {t} · {m} m walk', { t: t12(ride.depart), m: ride.pickup.walk_m }) })),
      el('div', { className: 'info-row from' }, icon('pin'), el('div', { className: 'truncate' }, el('div', { className: 'lbl', textContent: 'Start Location' }), el('div', { className: 'val truncate', textContent: tPickup(ride.pickup.label) }))),
      el('div', { className: 'info-row to' }, icon('pin'), el('div', { className: 'truncate' }, el('div', { className: 'lbl', textContent: 'Your Destination' }), el('div', { className: 'val truncate', textContent: cfg.campuses[ride.campus].name })))),
    el('div', { className: 'card' }, el('div', { className: 'body muted', textContent: 'Booking Details' }),
      el('div', { className: 'row mt8' }, el('span', { className: 'car-tile' }, icon('users')), el('span', { className: 'grow big', textContent: 'Shared' }), el('span', { className: 'body muted', textContent: t('Arrive by {t}', { t: t12(arriveBy()) }) })),
      el('div', { className: 'row mt8' }, el('span', { className: 'car-tile cash' }, icon('cash')), el('span', { className: 'big', textContent: 'Cash' }))),
    ['OPEN', 'READY_CHECK', 'DISPATCHED', 'ACCEPTED'].includes(ride.state) ? leave : null,
  ].filter(Boolean));
  const actions = $('st-actions');
  actions.replaceChildren(...(ride.state === 'OPEN'
    ? [el('div', { className: 'hint', textContent: t('Starts automatically at {t}', { t: t12(ride.join_closes) }) }), button('Find driver', () => act('find-driver'))]
    : []));
  actions.hidden = !actions.children.length;
  drawRideMap(ride);
  // Sheets follow the ride: the ready check opens for everyone and closes when the ride goes to drivers
  if (ride.state === 'READY_CHECK') openSheet('ready');
  else if (sheetKind === 'ready' || (sheetKind === 'leave' && !['OPEN', 'DISPATCHED', 'ACCEPTED'].includes(ride.state))) closeSheet();
  else if (sheetKind) openSheet(sheetKind);
}

function renderSummary() { // NextStop web/src/screens/Summary.tsx
  const screen = $('ridescreen'), ride = joinedRide;
  screen.classList.add('summary');
  closeSheet();
  $('st-head').hidden = true;
  const s = ride && ride.summary, left = leftSummary, canceled = ride && ride.state === 'CANCELED' && !left;
  const ok = !!s && !left;
  const title = ok ? 'You’ve arrived' : left ? 'You left this ride' : 'Ride canceled';
  const card = el('div', { className: 'card card-border sum' });
  if (ok) {
    card.append(el('div', { className: 'body muted', textContent: 'You paid' }), el('div', { className: 'display', textContent: money(s.paid) }),
      el('div', { className: 'row body-l' }, el('span', { className: 'cashico' }, icon('cash')), 'Cash'), el('div', { className: 'divider' }),
      el('div', { className: 'row-between' }, el('span', { className: 'body text-700', textContent: `${s.riders} riders shared this ride` }), seatRow({ ...ride, state: 'COMPLETED' }, 24)),
      s.saved ? el('p', { className: 'body success-text saved', textContent: `You saved ${money(s.saved)} vs riding solo` }) : null);
  } else if (left) {
    card.append(left.late ? el('p', { className: 'body-l danger-text m0', textContent: `${money(left.charge)} added to your next ride` })
      : el('p', { className: 'body-l text-700 m0', textContent: 'Leaving was free.' }));
  } else {
    card.append(el('p', { className: 'body-l text-700 m0', textContent: (ride.cancel_reason || 'This ride was canceled.') + ' You can book a new ride any time.' }));
  }
  const kids = [el('div', { className: 'success-circle' + (ok ? '' : ' off') }, icon(ok ? 'checkc' : 'nocar')),
    el('h1', { className: 'h1 center', textContent: title }),
    el('p', { className: 'body muted center sumsub', textContent: ok ? `To ${cfg.campuses[ride.campus].name} · arrived ${t12(s.arrived)}` : canceled ? 'No fees were charged.' : `To ${cfg.campuses[(ride || left.ride).campus].name}` }),
    card];
  if (ok) kids.push(el('div', { className: 'card card-border sum drv' }, el('div', { className: 'body muted', textContent: `${s.driver} (driver)` }),
    el('div', { className: 'row-between body' }, el('span', { textContent: `Cash from ${s.riders} riders` }), el('span', { textContent: money(s.cash) })),
    s.credit ? el('div', { className: 'row-between body' }, el('span', { textContent: 'Credit from Jeeny' }), el('span', { textContent: money(s.credit) })) : null,
    el('div', { className: 'divider' }), el('div', { className: 'row-between total' }, el('span', { textContent: 'Total' }), el('span', { textContent: money(s.driver_total) }))));
  if (ride && chatLog.length) kids.push(chatLink());
  $('st-cards').replaceChildren(...kids);
  const done = button('Done', () => { leftSummary = null; restartClock(); go('home', true); });
  $('st-actions').replaceChildren(...[balance ? el('div', { className: 'balance-strip' }, icon('wallet'), `Outstanding balance ${money(balance)}`) : null, done].filter(Boolean));
  $('st-actions').hidden = false;
}
const chatLink = () => { const b = el('button', { className: 'card row' }, icon('chat'), el('span', { className: 'grow', textContent: 'Group chat' }), icon('next')); b.onclick = () => go('chatscreen'); return b; };

// --- Bottom sheets (NextStop components/ui.tsx BottomSheet) ---
function openSheet(kind) {
  sheetKind = kind;
  const body = kind === 'ready' ? readySheet() : kind === 'leave' ? leaveSheet() : demoSheet();
  $('ns-sheet-body').replaceChildren(...body);
  $('ns-sheet').hidden = false;
  $('ns-scrim').onclick = kind === 'ready' ? null : closeSheet; // the ready check needs an answer
}
function closeSheet() { sheetKind = null; $('ns-sheet').hidden = true; }

function readySheet() {
  const ride = joinedRide, rc = ride.ready_check, total = 5 * 60;
  const left = Math.max(0, (toMin(rc.ends) - simNow) * 60);
  const r = 44, c = 2 * Math.PI * r;
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.innerHTML = `<circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--gray-200)" stroke-width="4"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="${left < 60 ? 'var(--amber-500)' : 'var(--pink)'}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - left / total)}"/>`;
  const rows = [['You', rc.me], ...ride.others.map((o) => [o.name, o.ready])].map(([n, ok]) =>
    el('div', { className: 'row-between rrow' }, el('div', { className: 'row' }, avatar(n, 32), el('span', { className: 'body-l fw5', textContent: n === 'You' ? me.profile.first_name : n })),
      el('span', { className: 'body fw5 ' + (ok ? 'success-text' : 'muted'), textContent: ok ? 'Ready ✓' : 'Waiting…' })));
  return [el('h2', { className: 'h2', textContent: 'Ready to find a driver?' }),
    el('p', { className: 'body muted m0', textContent: 'You started the ready check. No answer counts as ready.' }),
    el('div', { className: 'ring' + (left < 60 ? ' low' : '') }, svg, el('span', { className: 'display', textContent: mmss(left) })),
    el('div', {}, ...rows),
    ...(rc.me ? [el('p', { className: 'body success-text center fw5', textContent: 'You’re ready. Waiting for others…' })]
      : [button('I’m ready', () => act('ready', { ready: true })), button('Cancel ride for me', () => act('ready', { ready: false }), 'btn btn-secondary'),
        el('p', { className: 'small muted center m0 fw4', textContent: 'Leaving now is free.' })])];
}
function leaveSheet() { // NextStop LeaveSheet
  const cost = joinedRide.leave_cost;
  return [el('h2', { className: 'h2', textContent: 'Leave this ride?' }),
    ...(cost ? [el('p', { className: 'body text-700 m0', textContent: 'Your driver is already booked and pickup is in less than 30 minutes.' }),
      el('div', { className: 'amount-box' }, el('span', { className: 'body text-700', textContent: 'You’ll pay your share' }), el('span', { className: 'danger-text amount', textContent: money(cost) })),
      el('p', { className: 'small muted m0 fw4', textContent: 'Added as an outstanding balance on your next ride.' })]
      : [el('p', { className: 'body text-700 m0', textContent: 'Leaving now is free. Others’ shares will update.' })]),
    button('Keep my seat', closeSheet),
    button(cost ? 'Leave anyway' : 'Leave ride', () => { closeSheet(); act('leave'); }, 'btn btn-secondary btn-danger')];
}
function demoSheet() { // the hidden demo menu: plain, not part of the Jeeny look
  const ride = joinedRide, items = [];
  const add = (label, fn) => items.push(button(label, () => { closeSheet(); fn(); }, 'demo-btn'));
  if (ride && ride.state === 'ACCEPTED' && !playing) add('Play the trip', () => { playing = true; renderRide(); });
  if (ride && ['DISPATCHED', 'ACCEPTED', 'IN_PROGRESS'].includes(ride.state)) add("Open the driver's app", openDriver);
  const last = ride && ride.others.length ? ride.others[ride.others.length - 1].name : null;
  if (last && ['OPEN', 'READY_CHECK', 'DISPATCHED', 'ACCEPTED'].includes(ride.state)) add(`${last} leaves`, () => act('dropout'));
  if (ride && ride.state === 'ACCEPTED' && simNow < toMin(ride.late_from)) add(`Skip to ${t12(hhmm(toMin(ride.late_from) + 5))} (late-leave window)`, () => { simNow = toMin(ride.late_from) + 5; lastMinute = -1; lastPoll = 0; });
  if (ride && ['ACCEPTED', 'IN_PROGRESS'].includes(ride.state)) add('Complete trip', () => act('complete'));
  add('Restart the demo', () => { leftSummary = null; restartClock(); go('home', true); });
  return [el('h2', { className: 'h2', textContent: 'Demo menu' }), el('p', { className: 'small muted m0 fw4', textContent: t('Simulated clock {t}. Not part of the app.', { t: t12(hhmm(simNow)) }) }), ...items];
}

async function act(name, body = {}) {
  const mine = seq, before = joinedRide;
  try {
    const r = await api(rideUrl(name), { ...body, now: hhmm(simNow) });
    if (mine !== seq) return;
    if (r.status === 'left') { afterLeave(r); return; }
    if (r.left) rideNote = r.replacement ? t('{a} left. {b} took the seat, so nothing changes for you.', { a: r.left.name, b: r.replacement })
      : r.left.late ? t('{a} left late and pays their own share, so yours stays {price}.', { a: r.left.name, price: money(r.ride.share) })
        : t('{a} left. With {n} riders your share is {price}.', { a: r.left.name, n: r.ride.riders, price: money(r.ride.share) });
    else if (r.ride.state !== before.state) rideNote = '';
    took(r);
  } catch (e) { toast(e.message); }
}
function took(r) { // apply a server reply: ride and any new chat messages
  joinedRide = r.ride;
  if (r.chat) addChat(r.chat);
  if (!LIVE.includes(joinedRide.state)) playing = false;
  showJoined();
}
function afterLeave(r) {
  const ride = joinedRide;
  closeSheet();
  joinedRide = null; offeredRide = null; playing = false; resetChat();
  if (r.charge) balance += r.charge;
  drawRide();
  showBook(currentTrip());
  $('ride').className = 'plain';
  $('ride').replaceChildren(noteLine(r.late ? t('You left this ride. {price} is added to your next ride.', { price: money(r.charge) })
    : t('You left the {t} ride. No charge.', { t: t12(ride.depart) })));
  if (r.late) { leftSummary = { late: true, charge: r.charge, ride }; renderRide(); } else if (view === 'ridescreen') back();
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
      showJoined();
    }
  } catch { /* offline: the next poll retries */ } finally { polling = false; }
}
function updateJoined() { // every simulated minute
  updateShell();
  if (view === 'ridescreen') $('rclock').textContent = t12(hhmm(simNow));
}

// --- Group chat, ported from NextStop web/src/screens/Chat.tsx ---
let chatLog = [], unread = 0;
function resetChat() { chatLog = []; unread = 0; chatSeq = 0; $('msgs').replaceChildren(); }
function openChat() {
  if (!joinedRide) { show('home'); return; }
  unread = 0;
  $('chat-title').textContent = `To ${joinedRide.campus} · ${t12(arriveBy())}`;
  $('chat-seats').replaceChildren(seatRow({ ...joinedRide, state: joinedRide.state === 'OPEN' ? 'OPEN' : 'X' }, 24));
  renderMsgs();
  chatLock();
}
function addChat(messages) {
  let fresh = 0;
  for (const m of messages) {
    if (m.seq <= chatSeq) continue;
    chatSeq = m.seq;
    chatLog.push(m);
    if (m.who && m.who !== me.profile.first_name) fresh++;
  }
  chatLog = chatLog.slice(-100);
  if (view === 'chatscreen') renderMsgs(); else unread += fresh;
  if (view === 'ridescreen' && fresh) renderRide();
}
const withMasks = (text) => text.split('•••').flatMap((part, i) => (i ? [el('span', { className: 'masked', textContent: '•••' }), part] : [part]));
function renderMsgs() {
  const items = [];
  chatLog.forEach((m, i) => {
    if (!m.who) { items.push(el('div', { className: 'msg-sys', textContent: m.text })); return; }
    const mine = m.who === me.profile.first_name, prev = chatLog[i - 1], next = chatLog[i + 1];
    const first = !prev || prev.who !== m.who, lastOfGroup = !next || next.who !== m.who;
    if (first && !mine) items.push(el('div', { className: 'msg-name', textContent: m.who }));
    items.push(el('div', { className: 'msg' + (mine ? ' mine' : '') },
      mine ? null : first ? avatar(m.who, 32) : el('span', { className: 'spacer' }),
      el('div', { className: 'bubble', dir: 'auto' }, ...withMasks(m.text))));
    if (lastOfGroup && m.at) items.push(el('div', { className: 'msg-time' + (mine ? ' mine' : ''), textContent: t12(m.at) }));
  });
  $('msgs').replaceChildren(...items);
  const sc = $('msgs').parentElement;
  sc.scrollTop = sc.scrollHeight;
}
function chatLock() { // read-only once the trip is over
  const done = !joinedRide || ['COMPLETED', 'CANCELED'].includes(joinedRide.state);
  $('say-form').hidden = done; $('chat-closed').hidden = !done;
}
function initChat() {
  const input = $('say'), send = $('send'), count = $('say-count');
  input.maxLength = cfg.chat_max;
  input.oninput = () => {
    send.disabled = !input.value.trim();
    count.hidden = input.value.length <= 250;
    count.textContent = `${input.value.length}/${cfg.chat_max}`;
  };
  $('say-form').onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !joinedRide) return;
    send.disabled = true;
    try {
      const r = await api(rideUrl('chat'), { text, after: chatSeq, now: hhmm(simNow) });
      input.value = ''; input.oninput();
      addChat(r.chat);
    } catch (ex) { toast(ex.message); send.disabled = false; }
  };
  $('demo-open').onclick = () => openSheet('demo');
}

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
  initShell(); initChat(); fillSelects(); renderLoginQr();
  matchMedia('(min-width: 980px)').addEventListener('change', renderLoginQr);
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
