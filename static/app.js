'use strict';
const $ = (id) => document.getElementById(id);
const jd = (n) => n.toFixed(2) + ' JD';
const LEVEL = { 'seats free': 'free', 'almost full': 'almost', full: 'packed' };
let cfg, me, map, layer, meetMarker, seq = 0;
// Simulated clock: runs per visitor, holds until they join so the demo can't expire.
let simNow = 0, lastFrame = 0, lastMinute = -1, running = false;
let buses = [], busMarkers = new Map(), lastCheck = null, joinedRide = null;
const hhmm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m) % 60).padStart(2, '0');
const toMin = (s) => s.split(':').reduce((h, m) => h * 60 + Number(m), 0);
const slowMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Build DOM nodes with textContent only, so no server string is ever parsed as HTML.
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
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
  running = false; joinedRide = null; $('restart').hidden = true;
  $('home').hidden = true; $('login').hidden = false;
}

// --- Home ---
async function openHome() {
  $('login').hidden = true; $('home').hidden = false;
  $('hello').textContent = `Hi ${me.profile.first_name}`;
  $('lecture').value = me.profile.lecture;
  $('hood').value = me.profile.hood;
  $('campus').value = 'JUST';
  if (!map) initMap();
  map.invalidateSize();
  $('restart').hidden = false;
  await restartClock();
}

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([32.53, 35.92], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  for (const r of cfg.routes) L.polyline(r.legs.flatMap((l) => l.path), { color: '#5B2384', weight: 4, opacity: 0.55 }).addTo(map);
  for (const c of Object.values(cfg.campuses)) L.marker([c.lat, c.lon], { icon: pin('me', 'U') }).bindTooltip(c.name).addTo(map);
  layer = L.layerGroup().addTo(map);
}

// --- Clock and moving buses ---
async function restartClock() {
  simNow = cfg.clock.start; lastMinute = -1; lastFrame = 0; joinedRide = null;
  $('clock').textContent = hhmm(simNow);
  running = false;
  await refresh();
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
  if (!slowMotion.matches || minute !== lastMinute) moveBuses();
  if (minute !== lastMinute) { lastMinute = minute; onMinute(); }
  requestAnimationFrame(frame);
}
function onMinute() {
  $('clock').textContent = hhmm(simNow);
  showBuses();
  if (joinedRide) showJoined();
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
const pin = (cls, text) => L.divIcon({ className: '', iconSize: [30, 30], html: `<div class="pin ${cls}">${text}</div>` });

async function refresh() {
  if (!$('lecture').value) return;
  const mine = ++seq; // drop responses that arrive after a newer change
  const trip = currentTrip();
  joinedRide = null; // changing the trip leaves the confirmed-ride view
  $('ride').replaceChildren(); $('ride').className = '';
  try {
    const now = hhmm(simNow);
    const [check, live] = await Promise.all([
      api('api/late-check?' + new URLSearchParams({ ...trip, now })), api('api/buses/predictions?now=' + now)]);
    if (mine !== seq) return;
    buses = live.buses;
    drawMap(trip);
    showStatus(check, trip);
    showBuses();
    showPrices(cfg.prices, trip.campus);
  } catch (e) {
    if (mine === seq) { $('status').className = ''; $('status').replaceChildren(el('p', { className: 'error', textContent: e.message })); }
  }
}

function drawMap(trip) {
  layer.clearLayers(); meetMarker = null; busMarkers = new Map();
  for (const b of buses.filter((x) => x.campus === trip.campus)) { // only buses the student could use
    busMarkers.set(b.id, L.marker(positionAt(b.track, simNow), { icon: pin(LEVEL[b.level], b.id), zIndexOffset: 500 })
      .bindTooltip(`${b.route_name}: arrives ${b.arrival}, ${b.level}`).addTo(layer));
  }
  const h = cfg.hoods.find((x) => x.id === trip.hood);
  L.marker([h.lat, h.lon], { icon: pin('me', 'Me') }).addTo(layer);
  const c = cfg.campuses[trip.campus];
  map.fitBounds([[h.lat, h.lon], [c.lat, c.lon], ...buses.filter((b) => b.campus === trip.campus).map((b) => [b.lat, b.lon])], { padding: [28, 28] });
}

function facts(pairs) {
  return el('dl', { className: 'facts' }, ...pairs.map(([k, v]) =>
    el('div', {}, el('dt', { textContent: k }), el('dd', { textContent: v }))));
}

function showStatus(c, trip) {
  lastCheck = c;
  const s = $('status');
  const b = c.bus;
  const canSync = cfg.sync_campuses.includes(trip.campus);
  s.className = !b || c.late_min ? 'late' : c.full ? 'full' : 'ontime';
  const verdict = c.past ? 'That lecture has already started' : !b ? 'No bus you can catch right now'
    : c.late_min ? `You'll be ${c.late_min} min late` : c.full ? 'The bus will be full' : "You'll make it by bus";
  s.replaceChildren(el('p', { className: 'verdict', textContent: verdict }));
  if (b) {
    s.append(
      el('p', { className: 'muted', textContent: `${b.route_name}, boarding at ${b.board.name} around ${b.board.time}${b.needs_taxi ? ' (taxi to the stop)' : ''}` }),
      facts([['bus arrives', b.arrival], ['full at your stop', b.board.occupancy_pct + '%'], ['total cost', jd(b.bus_cost)]]));
  }
  if (!canSync) s.append(el('p', { className: 'muted', textContent: 'Shared rides are JUST-only in this pilot.' }));
  else if (!c.past) {
    const btn = el('button', { className: c.suggest_sync ? 'primary' : 'ghost', textContent: 'Sync a ride' });
    if (!c.suggest_sync) btn.style.cssText = 'width:100%;margin-top:12px';
    btn.onclick = () => sync(trip, false, btn);
    s.append(btn);
  }
}

// --- Sync a ride ---
async function sync(trip, womenOnly, control) {
  const mine = ++seq;
  if (control) control.disabled = true;
  const box = $('ride');
  box.className = '';
  try {
    const r = await api('api/rides/match', { ...trip, women_only: womenOnly, now: hhmm(simNow) });
    if (mine !== seq) return;
    showRide(r, trip, womenOnly);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    if (mine === seq) box.replaceChildren(el('p', { className: 'error', textContent: e.message }));
  } finally { if (control) control.disabled = false; }
}

function womenToggle(trip, on) {
  if (me.profile.gender === 'M') return null;
  if (me.profile.gender !== 'F') {
    return el('p', { className: 'muted', textContent: 'Women-only rides need a profile confirmed by the university registry.' });
  }
  const input = el('input', { type: 'checkbox', checked: on });
  input.onchange = () => sync(trip, input.checked, input);
  return el('label', { className: 'toggle' }, 'Women-only ride', input);
}

function showRide({ ride, reason }, trip, womenOnly) {
  const box = $('ride');
  if (meetMarker) { meetMarker.remove(); meetMarker = null; }
  if (!ride) {
    box.replaceChildren(...[el('h3', { textContent: 'No match yet' }), el('p', { className: 'muted', textContent: reason }),
      womenToggle(trip, womenOnly)].filter(Boolean));
    return;
  }
  meetMarker = L.marker([ride.pickup.lat, ride.pickup.lon], { icon: pin('meet', '★') }).bindTooltip('Pickup').addTo(layer);
  const join = el('button', { className: 'primary', textContent: `Join for ${jd(ride.seat_price)}` });
  const err = el('p', { className: 'error' });
  join.onclick = async () => {
    const mine = ++seq; // ignore the reply if the trip changes meanwhile
    join.disabled = true; err.textContent = '';
    try {
      const r = await api(`api/rides/${encodeURIComponent(ride.id)}/join`, { now: hhmm(simNow) });
      if (mine !== seq) return;
      joinedRide = r.ride;
      showJoined();
      $('ride').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { err.textContent = e.message; join.disabled = false; }
  };
  box.replaceChildren(...[
    el('h3', { textContent: `${ride.others.length} ${ride.women_only ? 'women' : 'students'} going your way` }),
    facts([['leaves', ride.depart], ['arrives', ride.arrive], ['per seat', jd(ride.seat_price)]]),
    riders(ride),
    el('p', { className: 'muted', textContent: `Pickup: ${ride.pickup.label}, about ${ride.pickup.walk_m} m walk` }),
    womenToggle(trip, womenOnly),
    el('p', { className: 'muted', textContent: ride.riders > cfg.min_riders
      ? `If someone drops out you pay at most ${jd(ride.max_seat_price)}. The ride needs at least ${cfg.min_riders} riders.`
      : `The ride needs all ${cfg.min_riders} riders to go ahead.` }),
    join, err].filter(Boolean));
  showPrices(ride.prices, trip.campus);
}
const riders = (ride) => el('ul', { className: 'riders' }, el('li', { textContent: 'You' }),
  ...ride.others.map((o) => el('li', { textContent: o.name })));

function showJoined() {
  const ride = joinedRide, p = ride.prices;
  const [title, text] = simNow < toMin(ride.depart)
    ? ["You're in", `Be at the ${ride.pickup.label} by ${ride.depart}. You'll reach ${ride.campus} at ${ride.arrive}.`]
    : simNow < toMin(ride.arrive) ? ['On your way', `You'll reach ${ride.campus} at ${ride.arrive}.`]
      : ["You've arrived", `You reached ${ride.campus} at ${ride.arrive}.`];
  const bus = lastCheck && lastCheck.bus;
  if (bus) { // the bus they skipped, for comparison
    const late = lastCheck.late_min;
    $('status').className = late ? 'late' : 'ontime';
    $('status').replaceChildren(
      el('p', { className: 'verdict', textContent: simNow >= bus.arrival_minute ? (late ? `The bus was ${late} min late` : 'The bus was on time')
        : late ? `The bus would be ${late} min late` : 'The bus would be on time' }),
      el('p', { className: 'muted', textContent: `${bus.route_name} ${simNow < bus.arrival_minute ? 'is predicted to arrive' : 'arrived'} at ${bus.arrival}.` }));
  } else $('status').replaceChildren();
  const box = $('ride');
  box.className = 'confirmed';
  box.replaceChildren(
    el('h3', { textContent: title }),
    el('p', { textContent: text }),
    riders(ride),
    el('div', { className: 'save' },
      el('div', {}, el('b', { textContent: jd(p.saved_vs_taxi_plus_bus) }), 'saved vs. taxi + bus'),
      el('div', {}, el('b', { textContent: jd(p.saved_vs_solo_taxi) }), 'saved vs. solo taxi')));
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
    el('p', { className: 'muted', style: 'margin-top:12px', textContent: `RideSync price with ${p.riders} riders.` }));
}
function showBuses() {
  $('buses').replaceChildren(...buses.map((b) => el('li', {},
    el('div', {}, el('b', { textContent: b.route_name }), el('span', { className: 'muted', textContent: simNow >= b.arrival_minute ? 'Arrived' : simNow < b.departs_minute ? 'Waiting to fill at the station' : 'On the road' })),
    el('div', { className: 'right' }, el('b', { textContent: b.arrival }), el('span', { className: 'lvl ' + LEVEL[b.level], textContent: `${b.level} at its busiest` })))));
}

async function start() {
  try { cfg = await api('api/config'); } catch (e) { $('login').hidden = false; $('login-error').textContent = e.message; return; }
  $('clock').textContent = cfg.now;
  $('hood').replaceChildren(...cfg.hoods.map((h) => el('option', { value: h.id, textContent: h.name })));
  $('campus').replaceChildren(...Object.entries(cfg.campuses).map(([id, c]) => el('option', { value: id, textContent: c.name })));
  for (const id of ['lecture', 'hood', 'campus']) $(id).addEventListener('change', refresh);
  $('logout').onclick = logout;
  $('restart').onclick = () => { restartClock(); };
  $('verify-form').onsubmit = (e) => { e.preventDefault(); verify($('email').value); };
  document.querySelectorAll('[data-demo]').forEach((b) => { b.onclick = () => verify(b.dataset.demo); });
  api('api/model').then((m) => {
    const a = m.arrival_mae_min;
    $('model').textContent = `Arrival model: ${a.model.toFixed(1)} min average error vs. ${a.baseline.toFixed(1)} min for a historical average, on ${m.held_out_days} held-out days of simulated trips.`;
  }).catch(() => {});
  me = store.get();
  if (me && me.session && me.profile) await openHome(); else { me = null; $('login').hidden = false; }
}
start();
