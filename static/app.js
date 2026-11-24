'use strict';
const $ = (id) => document.getElementById(id);
const jd = (n) => n.toFixed(2) + ' JD';
const LEVEL = { 'seats free': 'free', 'almost full': 'almost', full: 'packed' };
let cfg, me, map, layer, meetMarker, seq = 0;
let routeLines = new Map();
// Simulated clock: runs per visitor, holds until they join so the demo can't expire.
let simNow = 0, lastFrame = 0, lastMinute = -1, running = false;
let buses = [], busMarkers = new Map(), lastCheck = null, offeredRide = null, joinedRide = null;
let timeline = null; // { head, start, end } of the timeline on screen
const hhmm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m) % 60).padStart(2, '0');
const toMin = (s) => s.split(':').reduce((h, m) => h * 60 + Number(m), 0);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Build DOM nodes with textContent only, so no server string is ever parsed as HTML.
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
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
  if (r.status === 401) { logout(); throw new Error('Please verify again'); }
  if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
  return data;
}

// --- Login ---
async function verify(email) {
  $('login-error').textContent = '';
  try {
    me = null;
    me = await api('api/verify', { email });
    store.set(me);
    await openHome();
  } catch (e) { $('login-error').textContent = e.message; }
}
function logout() {
  me = null; store.set(null); seq++;
  running = false; joinedRide = null;
  $('home').hidden = true; $('login').hidden = false;
}

// --- Home ---
async function openHome() {
  $('login').hidden = true; $('home').hidden = false;
  $('hello').textContent = me.profile.first_name;
  $('me-av').textContent = me.profile.first_name[0];
  $('lecture').value = me.profile.lecture;
  $('hood').value = me.profile.hood;
  $('campus').value = 'JUST';
  if (!map) initMap();
  map.invalidateSize();
  await restartClock();
}

function marker(latlng, cls, kids, extra = {}) {
  const node = el('div', { className: 'mk ' + cls }, ...kids);
  return L.marker(latlng, { icon: L.divIcon({ className: '', iconSize: [0, 0], html: node }), ...extra });
}

function initMap() {
  map = L.map('map', { zoomControl: false, zoomSnap: 0.25 }).setView([32.53, 35.92], 11);
  map.attributionControl.setPrefix('');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  for (const r of cfg.routes) {
    const path = r.legs.flatMap((l) => l.path);
    const casing = L.polyline(path, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(map);
    const line = L.polyline(path, { color: '#cdb8df', weight: 5 }).addTo(map);
    routeLines.set(r.id, { casing, line });
  }
  layer = L.layerGroup().addTo(map);
}

// --- Clock and moving buses ---
async function restartClock() {
  simNow = cfg.clock.start; lastMinute = -1; lastFrame = 0; joinedRide = null;
  $('clock').textContent = hhmm(simNow);
  running = false;
  await refresh();
  $('sheet').scrollTop = 0;
  if (me && !running) { running = true; requestAnimationFrame(frame); }
}
function frame(ts) {
  if (!running) return;
  const dt = lastFrame ? Math.min((ts - lastFrame) / 1000, 0.5) : 0; // no jump after a hidden tab
  lastFrame = ts;
  const k = cfg.clock;
  const limit = k.start + (joinedRide ? k.run : k.hold_after);
  if (simNow < limit) simNow = Math.min(limit, simNow + dt * (joinedRide ? k.speed_joined : k.speed));
  const minute = Math.floor(simNow);
  if (!reducedMotion.matches || minute !== lastMinute) { moveBuses(); moveHead(); }
  if (minute !== lastMinute) { lastMinute = minute; onMinute(); }
  requestAnimationFrame(frame);
}
function onMinute() {
  $('clock').textContent = hhmm(simNow);
  showBuses();
  if (joinedRide) updateJoined();
  else recheck();
}
async function recheck() { // a bus may become impossible to catch as time passes
  const mine = seq;
  const trip = currentTrip();
  if (!trip.lecture) return;
  try {
    const c = await api('api/late-check?' + new URLSearchParams({ ...trip, now: hhmm(simNow) }));
    if (mine === seq && !joinedRide && JSON.stringify(c) !== JSON.stringify(lastCheck)) showStatus(c, trip);
  } catch { /* keep showing the last answer */ }
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
function moveBuses() {
  for (const b of buses) busMarkers.get(b.id)?.setLatLng(positionAt(b.track, simNow));
}
const currentTrip = () => ({ hood: $('hood').value, lecture: $('lecture').value, campus: $('campus').value });

async function refresh() {
  if (!$('lecture').value) return;
  const mine = ++seq; // drop responses that arrive after a newer change
  const trip = currentTrip();
  joinedRide = null; // changing the trip leaves the confirmed-ride view
  offeredRide = null;
  $('ride').replaceChildren(); $('ride').className = '';
  try {
    const now = hhmm(simNow);
    const [check, live] = await Promise.all([
      api('api/late-check?' + new URLSearchParams({ ...trip, now })), api('api/buses/predictions?now=' + now)]);
    if (mine !== seq) return;
    buses = live.buses;
    showStatus(check, trip);
    drawMap(trip);
    showBuses();
    showPrices(cfg.prices, trip.campus);
  } catch (e) {
    if (mine === seq) { $('status').className = ''; $('status').replaceChildren(el('p', { className: 'error', textContent: e.message })); }
  }
}

function drawMap(trip) {
  layer.clearLayers(); meetMarker = null; busMarkers = new Map();
  const mineRoute = lastCheck.bus && lastCheck.bus.route;
  for (const [id, r] of routeLines) r.line.setStyle({ color: id === mineRoute ? '#5B2384' : '#cdb8df' });
  if (mineRoute) { routeLines.get(mineRoute).casing.bringToFront(); routeLines.get(mineRoute).line.bringToFront(); }
  for (const b of buses.filter((x) => x.campus === trip.campus)) { // only buses the student could use
    busMarkers.set(b.id, marker(positionAt(b.track, simNow), 'mk-bus ' + LEVEL[b.level], [icon('bus')], { zIndexOffset: 500 })
      .bindTooltip(`${b.route_name}: arrives ${b.arrival}, ${b.level}`, { offset: [14, 0] }).addTo(layer));
  }
  const h = cfg.hoods.find((x) => x.id === trip.hood);
  marker([h.lat, h.lon], 'mk-me', [], { interactive: false }).addTo(layer);
  const c = cfg.campuses[trip.campus];
  marker([c.lat, c.lon], 'mk-campus', [icon('cap'), c.name.replace(' University', '')], { interactive: false }).addTo(layer);
  map.fitBounds([[h.lat, h.lon], [c.lat, c.lon], ...buses.filter((b) => b.campus === trip.campus).flatMap((b) => b.track.map((p) => p.slice(1)))],
    { paddingTopLeft: [44, 88], paddingBottomRight: [44, 92], maxZoom: 14 });
}

function meter(pct, level) {
  const on = Math.max(1, Math.round(pct / 10));
  return el('div', { className: 'meter ' + LEVEL[level], ariaHidden: 'true' },
    ...Array.from({ length: 10 }, (_, i) => el('i', { className: i < on ? 'on' : '' })));
}

// --- Timeline: bus vs. shared ride against the lecture ---
function drawTimeline(box, check, ride) {
  timeline = null;
  box.replaceChildren();
  const bus = check.bus;
  if (check.past || (!bus && !ride)) return;
  const lec = toMin(check.lecture);
  const start = cfg.clock.start;
  const last = Math.max(lec, bus ? bus.arrival_minute : 0, ride ? toMin(ride.arrive) : 0);
  const end = last + Math.max(6, (last - start) * 0.22); // room for a time label after the last bar
  const x = (m) => Math.max(0, Math.min(100, ((m - start) / (end - start)) * 100));
  const seg = (cls, from, to) => {
    const s = el('div', { className: 'seg ' + cls });
    s.style.left = x(from) + '%';
    s.style.width = x(to) - x(from) + '%';
    return s;
  };
  const lane = (name, ic, parts, cls = '') => el('div', { className: 'lane ' + cls },
    el('span', { className: 'who' }, icon(ic), name), ...parts);
  const label = (from, to, time, cls = '') => { // after the bar, unless the lecture line is in the way
    const o = el('span', { className: 'out ' + cls, textContent: time });
    const blocked = lec >= to && x(lec) - x(to) < 22;
    if (!blocked) o.style.left = x(to) + '%';
    else if (x(from) > 22) o.style.right = 100 - x(from) + '%';
    else { o.style.right = 100 - x(to) + '%'; o.classList.add('in'); }
    return o;
  };
  const bar = (cls, from, to, time) => [seg(cls, from, to), label(from, to, time)];
  if (bus) {
    const a = bus.board.minute, z = bus.arrival_minute;
    const late = Math.round(z) > lec && a < lec;
    box.append(lane('Bus', 'bus', late
      ? [seg('cut', a, lec), seg('over', lec, z), label(a, z, bus.arrival, 'late')]
      : bar(z > lec ? 'late-bar' : '', a, z, bus.arrival)));
  }
  if (cfg.sync_campuses.includes(currentTrip().campus)) {
    box.append(ride ? lane('Ride', 'car', bar('ride', toMin(ride.depart), toMin(ride.arrive), ride.arrive))
      : lane('Ride', 'car', [el('span', { className: 'hint', textContent: 'Sync to compare' })], 'empty'));
  }
  const line = el('div', { className: 'lecline' + (x(lec) > 78 ? ' edge' : '') }, el('span', { textContent: `Lecture ${check.lecture}` }));
  line.style.left = x(lec) + '%';
  const head = el('div', { className: 'head', ariaHidden: 'true' });
  box.append(line, head);
  timeline = { head, x };
  moveHead();
}
function moveHead() { if (timeline) timeline.head.style.left = timeline.x(simNow) + '%'; }

function showStatus(c, trip) {
  lastCheck = c;
  const s = $('status');
  const b = c.bus;
  const canSync = cfg.sync_campuses.includes(trip.campus);
  s.className = c.past ? '' : !b || c.late_min ? 'late' : c.full ? 'full' : 'ontime';
  const verdict = c.past ? 'That lecture has already started' : !b ? 'No bus you can catch right now'
    : c.late_min ? `You'll be ${c.late_min} min late` : c.full ? 'The bus will be full' : "You'll make it by bus";
  s.replaceChildren(el('p', { className: 'verdict', textContent: verdict }));
  if (b) {
    s.append(el('p', { className: 'sub', textContent: `${b.needs_taxi ? 'Taxi' : 'Walk'} to ${b.board.name}, then the ${b.route_name} bus around ${b.board.time}` }));
  }
  const tl = el('div', { className: 'tl', id: 'tl' });
  s.append(tl);
  drawTimeline(tl, c, offeredRide);
  if (!tl.children.length) tl.remove();
  if (b && !offeredRide) { // once there's a ride, the timeline and ticket carry the comparison
    s.append(el('div', { className: 'stats' },
      el('div', {}, el('b', { textContent: b.arrival }), el('span', { textContent: 'bus arrives' })),
      el('div', {}, el('b', { textContent: jd(b.bus_cost) }), el('span', { textContent: b.needs_taxi ? 'taxi + bus' : 'bus fare' })),
      el('div', {}, el('span', { textContent: `${b.board.occupancy_pct}% full at your stop` }), meter(b.board.occupancy_pct, b.board.level))));
  }
  if (!canSync) s.append(el('p', { className: 'sub', textContent: 'Shared rides are JUST-only in this pilot.' }));
  else if (!c.past && !offeredRide) {
    const btn = el('button', { className: c.suggest_sync ? 'primary' : 'ghost', textContent: 'Sync a ride' });
    btn.onclick = () => sync(trip, false, btn);
    s.append(btn);
  }
}

// --- Sync a ride ---
async function sync(trip, womenOnly, control) {
  const mine = ++seq;
  if (control) control.disabled = true;
  const box = $('ride');
  try {
    const r = await api('api/rides/match', { ...trip, women_only: womenOnly, now: hhmm(simNow) });
    if (mine !== seq) return;
    const first = !box.children.length;
    showRide(r, trip, womenOnly);
    if (first) {
      box.classList.add('in');
      box.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
    } else if (control && control.type === 'checkbox') box.querySelector('.toggle input')?.focus();
  } catch (e) {
    if (mine === seq) { box.className = 'plain'; box.replaceChildren(el('p', { className: 'error', textContent: e.message })); }
  } finally { if (control) control.disabled = false; }
}

function womenToggle(trip, on) {
  if (me.profile.gender === 'M') return null;
  if (me.profile.gender !== 'F') {
    return el('p', { className: 'line' }, icon('shield'), 'Women-only rides need a profile confirmed by the university registry.');
  }
  const input = el('input', { type: 'checkbox', checked: on });
  input.onchange = () => sync(trip, input.checked, input);
  return el('label', { className: 'toggle' }, icon('shield'), 'Women-only ride', input);
}

function riders(ride) {
  const names = ['You', ...ride.others.map((o) => o.name)];
  const initial = (n) => (n === 'You' ? me.profile.first_name : n)[0];
  const seats = names.map((n, i) => el('span', { className: 'av v' + i, textContent: initial(n) }));
  for (let i = names.length; i < cfg.max_riders; i++) seats.push(el('span', { className: 'av free', textContent: '+' }));
  return el('div', { className: 'crew' }, el('div', { className: 'avs', ariaHidden: 'true' }, ...seats),
    el('ul', { className: 'riders' }, ...names.map((n) => el('li', { textContent: n }))));
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
const pickupLine = (ride) => el('p', { className: 'line' }, icon('walk'), `${ride.pickup.label}, about ${ride.pickup.walk_m} m walk`);

function showRide({ ride, reason }, trip, womenOnly) {
  const box = $('ride');
  offeredRide = ride;
  if (meetMarker) { meetMarker.remove(); meetMarker = null; }
  showStatus(lastCheck, trip); // adds the ride to the timeline, or brings the Sync button back
  if (!ride) {
    box.className = 'plain';
    box.replaceChildren(...[el('h3', { textContent: 'No match yet' }), el('p', { className: 'sub', textContent: reason }),
      womenToggle(trip, womenOnly)].filter(Boolean));
    return;
  }
  box.className = '';
  meetMarker = marker([ride.pickup.lat, ride.pickup.lon], 'mk-meet', [icon('pin')], { zIndexOffset: 400 }).addTo(layer);
  const join = el('button', { className: 'primary', textContent: `Join for ${jd(ride.seat_price)}` });
  const err = el('p', { className: 'error', role: 'alert' });
  join.onclick = async () => {
    const mine = ++seq; // ignore the reply if the trip changes meanwhile
    join.disabled = true; err.textContent = '';
    try {
      const r = await api(`api/rides/${encodeURIComponent(ride.id)}/join`, { now: hhmm(simNow) });
      if (mine !== seq) return;
      joinedRide = r.ride;
      showJoined();
    } catch (e) { err.textContent = e.message; join.disabled = false; }
  };
  box.replaceChildren(
    ticketTop(ride, `${ride.others.length} ${ride.women_only ? 'women' : 'students'} going your way`),
    el('div', { className: 'perf' }),
    el('div', { className: 't-body' }, ...[
      riders(ride), pickupLine(ride), womenToggle(trip, womenOnly),
      el('div', { className: 'price' },
        el('b', {}, ride.seat_price.toFixed(2), el('small', { textContent: 'JD' })),
        el('span', { textContent: ride.riders > cfg.min_riders
          ? `At most ${jd(ride.max_seat_price)} if someone drops out. Needs ${cfg.min_riders} riders.`
          : `The ride needs all ${cfg.min_riders} riders to go ahead.` })),
      join, err].filter(Boolean)));
  showPrices(ride.prices, trip.campus);
}

function showJoined() {
  const ride = joinedRide, p = ride.prices, box = $('ride');
  box.className = 'confirmed in';
  box.replaceChildren(
    ticketTop(ride, '', true),
    el('div', { className: 'perf' }),
    el('div', { className: 't-body' },
      riders(ride), pickupLine(ride),
      el('div', { className: 'save' },
        el('div', {}, el('b', { textContent: jd(p.saved_vs_taxi_plus_bus) }), 'saved vs. taxi + bus'),
        el('div', {}, el('b', { textContent: jd(p.saved_vs_solo_taxi) }), 'saved vs. solo taxi'))));
  updateJoined();
  $('sheet').scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}
function updateJoined() { // runs every simulated minute: text and car only, no rebuild
  const ride = joinedRide, go = toMin(ride.depart), end = toMin(ride.arrive);
  $('t-text').textContent = simNow < go ? "You're in. Be there by " + ride.depart
    : simNow < end ? 'On your way' : "You've arrived";
  $('ride').querySelector('.car').style.left = Math.max(0, Math.min(100, ((simNow - go) / (end - go)) * 100)) + '%';
  const bus = lastCheck && lastCheck.bus;
  if (!bus) return;
  const late = lastCheck.late_min, there = simNow >= bus.arrival_minute;
  $('status').className = late ? 'late' : 'ontime';
  $('status').querySelector('.verdict').textContent = there ? (late ? `The bus was ${late} min late` : 'The bus was on time')
    : late ? `The bus would be ${late} min late` : 'The bus would be on time';
}

// --- Prices and buses ---
function showPrices(p, campus) {
  if (!cfg.sync_campuses.includes(campus)) { $('prices').replaceChildren(); return; }
  const rows = [['Bus only', p.bus, jd(p.bus)], ['RideSync', p.ridesync, jd(p.ridesync)], ['Taxi + bus', p.taxi_plus_bus, jd(p.taxi_plus_bus)],
    ['Solo taxi', p.solo_taxi, `${p.solo_taxi_min.toFixed(0)}–${p.solo_taxi_max.toFixed(0)} JD`]];
  $('prices').replaceChildren(el('h3', { textContent: 'What the trip costs' }),
    el('div', { className: 'bars' }, ...rows.map(([name, v, text]) => {
      const fill = el('div', { className: 'fill' });
      fill.style.width = (v / p.solo_taxi) * 100 + '%';
      return el('div', { className: 'bar' + (name === 'RideSync' ? ' us' : '') },
        el('span', { textContent: name }), el('div', { className: 'track' }, fill), el('span', { textContent: text }));
    })),
    el('p', { className: 'note', textContent: `RideSync price with ${p.riders} riders.` }));
}
function showBuses() {
  $('buses').replaceChildren(...buses.map((b) => {
    const done = simNow >= b.arrival_minute;
    const when = done ? 'Arrived' : simNow < b.departs_minute ? 'Waiting to fill' : 'On the road';
    return el('li', { className: done ? 'done' : '' },
      el('span', { className: 'rt' }, icon('bus')),
      el('div', {}, el('b', { textContent: b.route_name.replace('→ ', '→\u00a0') }), el('span', { className: 'when', textContent: done ? when : `${when}, ${b.level === 'seats free' ? b.level : 'gets ' + b.level}` })),
      el('div', { className: 'right' }, el('b', { textContent: b.arrival }), meter(b.peak_occupancy_pct, b.level)));
  }));
}

async function start() {
  try { cfg = await api('api/config'); } catch (e) { $('login').hidden = false; $('login-error').textContent = e.message; return; }
  $('hood').replaceChildren(...cfg.hoods.map((h) => el('option', { value: h.id, textContent: h.name })));
  $('campus').replaceChildren(...Object.entries(cfg.campuses).map(([id, c]) => el('option', { value: id, textContent: c.name })));
  for (const id of ['lecture', 'hood', 'campus']) $(id).addEventListener('change', refresh);
  $('logout').onclick = logout;
  $('restart').onclick = () => { restartClock(); };
  $('verify-form').onsubmit = (e) => { e.preventDefault(); verify($('email').value); };
  document.querySelectorAll('[data-demo]').forEach((b) => { b.onclick = () => verify(b.dataset.demo); });
  addEventListener('resize', () => map && map.invalidateSize());
  api('api/model').then((m) => {
    const a = m.arrival_mae_min;
    $('model').textContent = `Arrival model: ${a.model.toFixed(1)} min average error vs. ${a.baseline.toFixed(1)} min for a historical average, on ${m.held_out_days} held-out days of simulated trips.`;
  }).catch(() => {});
  me = store.get();
  if (me && me.session && me.profile) await openHome(); else { me = null; $('login').hidden = false; }
}
start();
