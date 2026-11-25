'use strict';
const $ = (id) => document.getElementById(id);
const LEVEL = { 'seats free': 'free', 'almost full': 'almost', full: 'packed' };
let cfg, me, map, layer, meetMarker, rideLayer, carMarker, seq = 0;
let routeLines = new Map();
// Simulated clock: runs per visitor, holds until they join so the demo can't expire.
let simNow = 0, lastFrame = 0, lastMinute = -1, running = false;
let buses = [], busMarkers = new Map(), lastCheck = null, offeredRide = null, joinedRide = null;
let playing = false; // after joining, the clock waits for "Play the trip"
let womenOnly = false, rideNote = '';
let shareToken = null, lastBeat = 0, beatNow = -1;
let plan = null, reserved = null, editWeek = false, planSeq = 0;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
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
  if (r.status === 401) { if (me) logout(); throw new Error('Please verify again'); }
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
  } catch (e) { $('login-error').textContent = t(e.message); }
}
function logout() {
  me = null; store.set(null); seq++;
  running = false; joinedRide = null;
  $('login-error').textContent = '';
  $('home').hidden = true; $('login').hidden = false;
}

// --- Home ---
async function openHome() {
  $('login').hidden = true; $('home').hidden = false;
  showMe();
  $('lecture').value = me.profile.lecture;
  $('hood').value = me.profile.hood;
  $('campus').value = 'JUST';
  womenOnly = false;
  if (!map) initMap();
  map.invalidateSize();
  await restartClock();
}

function showMe() {
  $('hello').textContent = t(me.profile.first_name);
  $('me-av').textContent = t(me.profile.first_name)[0];
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
  running = false;
  try { await api('api/demo/reset', {}); } catch (e) { // offline: carry on; session gone: back to login
    if (!me) { $('login-error').textContent = t(e.message); return; }
  }
  simNow = cfg.clock.start; lastMinute = -1; lastFrame = 0; joinedRide = null; playing = false;
  reserved = null; plan = null; editWeek = false; womenOnly = false;
  $('clock').textContent = hhmm(simNow);
  await refresh();
  $('sheet').scrollTop = 0;
  if (me && !running) { running = true; requestAnimationFrame(frame); }
}
function frame(ts) {
  if (!running) return;
  // A hidden tab catches up only while the trip plays, to match what family sees.
  const dt = lastFrame ? Math.min((ts - lastFrame) / 1000, playing ? Infinity : 0.5) : 0;
  lastFrame = ts;
  const k = cfg.clock;
  const limit = k.start + (playing ? k.run : k.hold_after);
  if (simNow < limit) simNow = Math.min(limit, simNow + dt * (playing ? k.speed_joined : k.speed));
  const minute = Math.floor(simNow);
  if (!reducedMotion.matches || minute !== lastMinute) { moveBuses(); moveHead(); }
  if (minute !== lastMinute) { lastMinute = minute; onMinute(); }
  if (shareToken && ts - lastBeat > (simNow === beatNow ? 5000 : 900)) beat(ts);
  requestAnimationFrame(frame);
}
function onMinute() {
  $('clock').textContent = hhmm(simNow);
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
  if (carMarker && joinedRide) carMarker.setLatLng(positionAt(joinedRide.track, simNow));
}
const currentTrip = () => ({ hood: $('hood').value, lecture: $('lecture').value, campus: $('campus').value });

async function refresh() {
  if (!$('lecture').value) return;
  const mine = ++seq; // drop responses that arrive after a newer change
  const trip = currentTrip();
  if (joinedRide && shareToken) api(`api/rides/${encodeURIComponent(joinedRide.id)}/unshare`, {}).catch(() => {});
  joinedRide = null; // changing the trip leaves the confirmed-ride view
  offeredRide = null; playing = false; shareToken = null; rideNote = '';
  $('ride').replaceChildren(); $('ride').className = '';
  try {
    const now = hhmm(simNow);
    const [check, live] = await Promise.all([
      api('api/late-check?' + new URLSearchParams({ ...trip, now })), api('api/buses/predictions?now=' + now)]);
    if (mine !== seq) return;
    buses = live.buses;
    showStatus(check, trip);
    drawMap(trip);
    showPrices(cfg.prices, trip.campus);
    loadPlan();
  } catch (e) {
    if (mine === seq) { $('status').className = ''; $('status').replaceChildren(el('p', { className: 'error', textContent: t(e.message) })); }
  }
}

function drawMap(trip, fit = true) {
  layer.clearLayers(); meetMarker = null; rideLayer = null; carMarker = null; busMarkers = new Map();
  const mineRoute = lastCheck.bus && lastCheck.bus.route;
  for (const [id, r] of routeLines) r.line.setStyle({ color: id === mineRoute ? '#5B2384' : '#cdb8df' });
  if (mineRoute) { routeLines.get(mineRoute).casing.bringToFront(); routeLines.get(mineRoute).line.bringToFront(); }
  for (const b of buses.filter((x) => x.campus === trip.campus)) { // only buses the student could use
    busMarkers.set(b.id, marker(positionAt(b.track, simNow), 'mk-bus ' + LEVEL[b.level], [icon('bus')], { zIndexOffset: 500 })
      .bindTooltip(t('{route}: arrives {t}, {level}', { route: tRoute(b.route_name), t: b.arrival, level: t(b.level) }), { offset: [14, 0] }).addTo(layer));
  }
  const h = cfg.hoods.find((x) => x.id === trip.hood);
  marker([h.lat, h.lon], 'mk-me', [], { interactive: false }).addTo(layer);
  const c = cfg.campuses[trip.campus];
  marker([c.lat, c.lon], 'mk-campus', [icon('cap'), t(c.name.replace(' University', ''))], { interactive: false }).addTo(layer);
  drawRide();
  if (fit) map.fitBounds([[h.lat, h.lon], [c.lat, c.lon], ...buses.filter((b) => b.campus === trip.campus).flatMap((b) => b.track.map((p) => p.slice(1)))],
    { paddingTopLeft: [44, 88], paddingBottomRight: [44, 92], maxZoom: 14 });
}

function drawRide() { // meeting point and road path of the offered or joined ride
  if (rideLayer) rideLayer.remove();
  rideLayer = null; meetMarker = null; carMarker = null;
  const ride = joinedRide || offeredRide;
  if (!ride) return;
  rideLayer = L.layerGroup().addTo(layer);
  L.polyline(ride.track.map((p) => p.slice(1)), { color: '#E5007D', weight: 4, opacity: 0.9, dashArray: '2 8' }).addTo(rideLayer);
  meetMarker = marker([ride.pickup.lat, ride.pickup.lon], 'mk-meet', [icon('pin')], { zIndexOffset: 400 }).addTo(rideLayer);
  if (joinedRide) carMarker = marker(positionAt(ride.track, simNow), 'mk-car', [icon('car')], { zIndexOffset: 600 }).addTo(rideLayer);
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
  const last = Math.max(lec, bus ? bus.arrival_minute : 0, bus ? toMin(bus.arrival_high) : 0, ride ? toMin(ride.arrive) : 0);
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
    const lo = toMin(bus.arrival_low), hi = toMin(bus.arrival_high);
    const range = seg('range', lo, hi);
    range.title = t('likely arrival {a}–{b}', { a: bus.arrival_low, b: bus.arrival_high });
    const a = bus.board.minute, z = bus.arrival_minute;
    const late = Math.round(z) > lec && a < lec;
    box.append(lane(t('Bus'), 'bus', late
      ? [range, seg('cut', a, lec), seg('over', lec, z), label(a, z, bus.arrival, 'late')]
      : [range, ...bar(z > lec ? 'late-bar' : '', a, z, bus.arrival)]));
  }
  if (cfg.sync_campuses.includes(currentTrip().campus)) {
    box.append(ride ? lane(t('Ride'), 'car', bar('ride', toMin(ride.depart), toMin(ride.arrive), ride.arrive))
      : lane(t('Ride'), 'car', [el('span', { className: 'hint', textContent: t('Sync to compare') })], 'empty'));
  }
  const line = el('div', { className: 'lecline' + (x(lec) > 78 ? ' edge' : '') }, el('span', { textContent: t('Lecture {t}', { t: check.lecture }) }));
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
  s.className = c.past ? '' : !b || c.late_min ? 'late' : c.full ? 'full' : c.risky ? 'risky' : 'ontime';
  const verdict = c.past ? t('That lecture has already started') : !b ? t('No bus you can catch right now')
    : c.late_min ? t("You'll be {n} min late", { n: c.late_min }) : c.full ? t('The bus will be full')
      : c.risky ? t('Cutting it close') : t("You'll make it by bus");
  s.replaceChildren(el('p', { className: 'verdict', textContent: verdict }));
  if (b && !c.past) {
    const edge = cfg.risk_bounds; // the model has no quantiles beyond these
    const pct = Math.round(c.late_risk * 100);
    const p = c.late_risk >= edge[1] ? t('over {p}%', { p: edge[1] * 100 }) : c.late_risk <= edge[0] ? t('under {p}%', { p: edge[0] * 100 }) : pct + '%';
    s.append(el('p', { className: 'risk' }, el('b', { textContent: t("{p} chance you're late", { p }) }),
      el('span', { textContent: t('likely arrival {a}–{b}', { a: ltr(b.arrival_low), b: ltr(b.arrival_high) }) })));
  }
  if (b) {
    s.append(el('p', { className: 'sub', textContent: t(b.needs_taxi ? 'Taxi to {stop}, then the {route} bus around {t}' : 'Walk to {stop}, then the {route} bus around {t}',
      { stop: t(b.board.name), route: tRoute(b.route_name), t: b.board.time }) }));
  }
  const tl = el('div', { className: 'tl', id: 'tl' });
  s.append(tl);
  drawTimeline(tl, c, offeredRide);
  if (!tl.children.length) tl.remove();
  if (b && !offeredRide) { // once there's a ride, the timeline and ticket carry the comparison
    s.append(el('div', { className: 'stats' },
      el('div', {}, el('b', { textContent: b.arrival }), el('span', { textContent: t('bus arrives') })),
      el('div', {}, el('b', { textContent: money(b.bus_cost) }), el('span', { textContent: t(b.needs_taxi ? 'taxi + bus' : 'bus fare') })),
      el('div', {}, el('span', { textContent: t('{n}% full at your stop', { n: b.board.occupancy_pct }) }), meter(b.board.occupancy_pct, b.board.level))));
  }
  if (!canSync) s.append(el('p', { className: 'sub', textContent: t('Shared rides are JUST-only in this pilot.') }));
  else if (!c.past && !offeredRide) {
    const btn = el('button', { className: c.suggest_sync ? 'primary' : 'ghost', textContent: t('Sync a ride') });
    btn.onclick = () => sync(trip, btn);
    s.append(btn);
  }
}

// --- Sync a ride ---
async function sync(trip, control) {
  const mine = ++seq;
  if (control) control.disabled = true;
  const box = $('ride');
  try {
    const r = await api('api/rides/match', { ...trip, women_only: womenOnly, now: hhmm(simNow) });
    if (mine !== seq) return;
    const first = !box.children.length;
    rideNote = '';
    showRide(r.ride, trip);
    if (first) {
      box.classList.add('in');
      box.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
    } else if (control && control.type === 'checkbox') box.querySelector('.toggle input')?.focus();
  } catch (e) {
    if (mine === seq) { box.className = 'plain'; box.replaceChildren(el('p', { className: 'error', textContent: t(e.message) })); }
  } finally { if (control) control.disabled = false; }
}

function womenToggle(trip) {
  if (me.profile.gender === 'M') return null;
  if (me.profile.gender !== 'F') {
    return el('p', { className: 'line' }, icon('shield'), t('Women-only rides need a profile confirmed by the university registry.'));
  }
  const input = el('input', { type: 'checkbox', checked: womenOnly });
  input.onchange = () => { womenOnly = input.checked; sync(trip, input); loadPlan(); };
  return el('label', { className: 'toggle' }, icon('shield'), t('Women-only ride'), input);
}

function riders(ride) {
  const names = [t('You'), ...ride.others.map((o) => t(o.name))];
  const seats = names.map((n, i) => el('span', { className: 'av v' + i, textContent: (i ? n : t(me.profile.first_name))[0] }));
  for (let i = names.length; i < cfg.max_riders; i++) seats.push(el('span', { className: 'av free', textContent: '+' }));
  return el('div', { className: 'crew' }, el('div', { className: 'avs', ariaHidden: 'true' }, ...seats),
    el('ul', { className: 'riders' }, ...names.map((n) => el('li', { textContent: n }))));
}

function ticketTop(ride, title, badge) {
  const car = el('span', { className: 'car' }, icon('car'));
  return el('div', { className: 't-top' },
    el('h3', { className: 't-title' }, badge ? el('span', { className: 'badge' }, icon('check')) : null, el('span', { id: 't-text', textContent: title })),
    el('div', { className: 'leg' },
      el('div', {}, el('b', { textContent: ride.depart }), el('small', { textContent: t('Pickup') })),
      el('div', { className: 'road' }, car),
      el('div', {}, el('b', { textContent: ride.arrive }), el('small', { textContent: t(ride.campus) }))));
}
const pickupLine = (ride) => el('p', { className: 'line' }, icon('walk'),
  t('{label}, about {n} m walk', { label: tPickup(ride.pickup.label), n: ride.pickup.walk_m }));

const noteLine = (text) => (text ? el('p', { className: 'notice', role: 'status', textContent: text }) : null);

function showRide(ride, trip) {
  const box = $('ride');
  offeredRide = ride;
  drawRide();
  showStatus(lastCheck, trip); // adds the ride to the timeline, or brings the Sync button back
  if (!ride) {
    box.className = 'plain';
    box.replaceChildren(...[el('h3', { textContent: t('No match yet') }),
      el('p', { className: 'sub', textContent: t('No group of {n}+ students nearby for this time yet', { n: cfg.min_riders }) }),
      womenToggle(trip)].filter(Boolean));
    return;
  }
  box.className = '';
  const join = el('button', { className: 'primary', textContent: t('Join for {price}', { price: money(ride.seat_price) }) });
  const err = el('p', { className: 'error', role: 'alert' });
  join.onclick = async () => {
    const mine = ++seq; // ignore the reply if the trip changes meanwhile
    join.disabled = true; err.textContent = '';
    try {
      const r = await api(`api/rides/${encodeURIComponent(ride.id)}/join`, { now: hhmm(simNow) });
      if (mine !== seq) return;
      joinedRide = r.ride; rideNote = ''; playing = false; shareToken = null;
      showJoined();
    } catch (e) { err.textContent = t(e.message); join.disabled = false; }
  };
  box.replaceChildren(
    ticketTop(ride, t(ride.women_only ? '{n} women going your way' : '{n} students going your way', { n: ride.others.length })),
    el('div', { className: 'perf' }),
    el('div', { className: 't-body' }, ...[
      noteLine(ride.earlier_min ? t('No car fits your exact time. This one arrives {n} min earlier.', { n: ride.earlier_min }) : ''),
      riders(ride), pickupLine(ride), womenToggle(trip),
      el('div', { className: 'price' },
        el('b', {}, ride.seat_price.toFixed(2), el('small', { textContent: lang === 'ar' ? 'د.أ' : 'JD' })),
        el('span', { textContent: ride.riders > cfg.min_riders
          ? t('At most {price} if someone drops out. Needs {n} riders.', { price: money(ride.max_seat_price), n: cfg.min_riders })
          : t('The ride needs all {n} riders to go ahead.', { n: cfg.min_riders }) })),
      join, err].filter(Boolean)));
  showPrices(ride.prices, trip.campus);
}

function showJoined(scroll = true) {
  const ride = joinedRide, p = ride.prices, box = $('ride');
  box.className = 'confirmed in';
  const play = el('button', { className: 'primary', id: 'play' }, icon('play'), t('Play the trip'));
  play.onclick = () => { playing = true; lastBeat = -1e6; updateJoined(); };
  const leave = el('button', { className: 'quiet', textContent: t('Leave ride') });
  const drop = el('button', { className: 'quiet demo', textContent: t('Demo: {name} drops out', { name: t(ride.others[ride.others.length - 1].name) }) });
  const err = el('p', { className: 'error', role: 'alert' });
  leave.onclick = () => rideAction('leave', [leave, drop], err, () => {
    shareToken = null; joinedRide = null; rideNote = '';
    showRide(ride, currentTrip());
  });
  drop.onclick = () => rideAction('dropout', [leave, drop], err, afterDropout);
  box.replaceChildren(
    ticketTop(ride, '', true),
    el('div', { className: 'perf' }),
    el('div', { className: 't-body' }, ...[
      noteLine(rideNote), riders(ride), pickupLine(ride),
      el('div', { className: 'save' },
        el('div', {}, el('b', { textContent: money(p.saved_vs_taxi_plus_bus) }), t('saved vs. taxi + bus')),
        el('div', {}, el('b', { textContent: money(p.saved_vs_solo_taxi) }), t('saved vs. solo taxi'))),
      shareBox(), play,
      el('div', { className: 'acts', id: 'acts' }, leave, drop), err].filter(Boolean)));
  drawRide();
  showPrices(p, ride.campus);
  updateJoined();
  if (scroll) $('sheet').scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}
async function rideAction(name, buttons, err, done) {
  const mine = seq;
  buttons.forEach((b) => { b.disabled = true; });
  err.textContent = '';
  try {
    const r = await api(`api/rides/${encodeURIComponent(joinedRide.id)}/${name}`, { now: hhmm(simNow) });
    if (mine === seq) done(r);
  } catch (e) { err.textContent = t(e.message); buttons.forEach((b) => { b.disabled = false; }); }
}
function afterDropout(r) {
  const a = t(r.left), n = cfg.min_riders;
  if (r.ride) {
    joinedRide = r.ride;
    offeredRide = r.ride;
    rideNote = r.replacement ? t('{a} dropped out. {b} took the seat, so nothing changes for you.', { a, b: t(r.replacement) })
      : t('{a} dropped out and nobody nearby could fill in. With {n} riders the seat is {price}.', { a, n: r.ride.riders, price: money(r.ride.seat_price) });
    showJoined(false);
    return;
  }
  joinedRide = null; offeredRide = null; shareToken = null;
  drawRide();
  showStatus(lastCheck, currentTrip()); // Sync button comes back
  showPrices(cfg.prices, currentTrip().campus);
  $('ride').className = 'plain';
  $('ride').replaceChildren(noteLine(t('{a} dropped out, so fewer than {n} riders were left and the ride was cancelled. No charge.', { a, n })));
}
function updateJoined() { // runs every simulated minute: text and car only, no rebuild
  const ride = joinedRide, go = toMin(ride.depart), end = toMin(ride.arrive);
  $('t-text').textContent = simNow < go ? t("You're in. Be there by {t}", { t: ride.depart })
    : simNow < end ? t('On your way') : t("You've arrived");
  $('ride').querySelector('.car').style.insetInlineStart = Math.max(0, Math.min(100, ((simNow - go) / (end - go)) * 100)) + '%';
  $('play').hidden = playing;
  $('acts').hidden = simNow >= go;
  const bus = lastCheck && lastCheck.bus;
  if (!bus) return;
  const n = lastCheck.late_min, there = simNow >= bus.arrival_minute;
  $('status').className = n ? 'late' : 'ontime';
  $('status').querySelector('.verdict').textContent = there ? (n ? t('The bus was {n} min late', { n }) : t('The bus was on time'))
    : n ? t('The bus would be {n} min late', { n }) : t('The bus would be on time');
}

// --- Family link ---
const tripUrl = () => new URL('trip.html#' + shareToken, location.href).href; // after '#', so it never reaches server logs
function shareBox() {
  const box = el('div', { className: 'share' });
  const err = el('p', { className: 'error', role: 'alert' });
  if (!shareToken) {
    const b = el('button', { className: 'ghost' }, icon('share'), t('Share trip with family'));
    b.onclick = async () => {
      b.disabled = true; err.textContent = '';
      const id = joinedRide.id;
      try {
        const r = await api(`api/rides/${encodeURIComponent(id)}/share`, { now: simNow, speed: playing ? cfg.clock.speed_joined : 0 });
        if (!joinedRide || joinedRide.id !== id) return;
        shareToken = r.token;
        box.replaceWith(shareBox());
        if (navigator.share) navigator.share({ title: t('{name} is sharing a RideSync trip', { name: t(me.profile.first_name) }), url: tripUrl() }).catch(() => {});
      } catch (e) { err.textContent = t(e.message); b.disabled = false; }
    };
    box.append(b, err);
    return box;
  }
  const input = el('input', { readOnly: true, value: tripUrl(), dir: 'ltr', ariaLabel: t('Trip link') });
  input.onfocus = () => input.select();
  const copy = el('button', { className: 'small', textContent: t('Copy') });
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(tripUrl()); } catch { input.select(); document.execCommand('copy'); } // plain http
    copy.textContent = t('Copied');
  };
  const open = el('a', { className: 'small', href: tripUrl(), target: '_blank', rel: 'noopener', textContent: t('Open') });
  const stop = el('button', { className: 'quiet', textContent: t('Stop sharing') });
  stop.onclick = async () => {
    stop.disabled = true; err.textContent = '';
    try {
      await api(`api/rides/${encodeURIComponent(joinedRide.id)}/unshare`, {});
      shareToken = null;
      box.replaceWith(shareBox());
    } catch (e) { err.textContent = t(e.message); stop.disabled = false; }
  };
  box.append(el('p', { className: 'line' }, icon('share'), t('Family can follow this trip')),
    el('div', { className: 'linkrow' }, input, copy, open), stop, err);
  return box;
}
async function beat(ts) {
  lastBeat = ts; beatNow = simNow;
  if (!joinedRide) return;
  try { await api(`api/rides/${encodeURIComponent(joinedRide.id)}/share`, { now: simNow, speed: playing ? cfg.clock.speed_joined : 0 }); } catch { /* next beat retries */ }
}

// --- Tomorrow ---
const weekKey = () => `ridesync-week-${me.profile.first_name}-${me.profile.university}`;
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
      const r = await api('api/plan', { hood: $('hood').value, campus: $('campus').value, lecture, women_only: womenOnly });
      if (mine !== planSeq) return;
      plan = r;
    } catch { if (mine !== planSeq) return; }
  }
  if (me) showPlan();
}
function showPlan() {
  const box = $('plan'), lecture = week()[tomorrow()];
  const edit = el('button', { className: 'quiet', textContent: t(editWeek ? 'Done' : 'Edit week') });
  edit.onclick = () => { editWeek = !editWeek; showPlan(); };
  const kids = [el('div', { className: 'planhead' }, el('h3', { textContent: t('Tomorrow, {day}', { day: t(DAYS[tomorrow()]) }) }),
    lecture && !editWeek ? el('span', { className: 'tag', textContent: t('Lecture {t}', { t: lecture }) }) : null, edit)];
  if (editWeek) {
    const rows = DAYS.map((d, i) => {
      const input = el('input', { type: 'time', value: week()[i] || '' });
      input.onchange = () => {
        const w = week();
        w[i] = input.value;
        try { localStorage.setItem(weekKey(), JSON.stringify(w)); } catch { /* private mode */ }
        if (i === tomorrow() && !reserved) loadPlan();
      };
      return el('label', {}, t(d), input);
    });
    kids.push(el('p', { className: 'sub', textContent: t('First lecture each day') }), el('div', { className: 'week' }, ...rows));
  }
  if (!lecture) kids.push(el('p', { className: 'sub', textContent: t('No lecture set for tomorrow.') }));
  else if (plan) {
    const b = plan.bus;
    kids.push(el('div', { className: 'opt' }, icon('bus'), el('div', {},
      el('b', { textContent: b ? t('To trust the bus, be at {stop} by {t}', { stop: t(b.stop), t: b.at_stop }) : t('No bus was reliable for this lecture time') }),
      b ? el('small', { textContent: t('On time on {a} of {b} simulated days', { a: b.ok_days, b: b.days }) }) : null)));
    const ride = reserved || plan.ride;
    if (cfg.sync_campuses.includes($('campus').value) || reserved) {
      const err = el('p', { className: 'error', role: 'alert' });
      let btn = null;
      if (ride) {
        btn = el('button', { className: reserved ? 'quiet' : 'small', textContent: t(reserved ? 'Cancel' : 'Reserve') });
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await api(`api/rides/${encodeURIComponent(ride.id)}/${reserved ? 'leave' : 'join'}`, {});
            if (reserved) { reserved = null; loadPlan(); } else { reserved = ride; showPlan(); }
          } catch (e) { err.textContent = t(e.message); btn.disabled = false; }
        };
      }
      kids.push(el('div', { className: 'opt us' + (reserved ? ' done' : '') }, icon(reserved ? 'check' : 'car'), el('div', {},
        el('b', { textContent: ride ? t('Shared ride at {t}, {price}', { t: ride.depart, price: money(ride.seat_price) }) : t('No shared ride matches this time yet') }),
        ride ? el('small', { textContent: reserved ? t('Seat reserved') : t(ride.women_only ? 'Women-only. Arrives {t}' : 'Arrives {t}', { t: ride.arrive }) }) : null), btn), err);
    }
  }
  box.replaceChildren(...kids);
}

// --- Prices ---
function showPrices(p, campus) {
  if (!cfg.sync_campuses.includes(campus)) { $('prices').replaceChildren(); return; }
  const rows = [['Bus only', p.bus, money(p.bus)], ['RideSync', p.ridesync, money(p.ridesync)], ['Taxi + bus', p.taxi_plus_bus, money(p.taxi_plus_bus)],
    ['Solo taxi', p.solo_taxi, ltr(`${p.solo_taxi_min.toFixed(0)}–${p.solo_taxi_max.toFixed(0)}`) + (lang === 'ar' ? ' د.أ' : ' JD')]];
  $('prices').replaceChildren(el('h3', { textContent: t('What the trip costs') }),
    el('div', { className: 'bars' }, ...rows.map(([name, v, text]) => {
      const fill = el('div', { className: 'fill' });
      fill.style.width = (v / p.solo_taxi) * 100 + '%';
      return el('div', { className: 'bar' + (name === 'RideSync' ? ' us' : '') },
        el('span', { textContent: t(name) }), el('div', { className: 'track' }, fill), el('span', { textContent: text }));
    })),
    el('p', { className: 'note', textContent: t('RideSync price with {n} riders.', { n: p.riders }) }));
}
function fillSelects() {
  const keep = [$('hood').value, $('campus').value];
  $('hood').replaceChildren(...cfg.hoods.map((h) => el('option', { value: h.id, textContent: t(h.name) })));
  $('campus').replaceChildren(...Object.entries(cfg.campuses).map(([id, c]) => el('option', { value: id, textContent: t(c.name) })));
  if (keep[0]) [$('hood').value, $('campus').value] = keep;
}
function rerender() { // language change: same state, new words
  $('restart').ariaLabel = $('restart').title = t('Restart the demo clock');
  $('logout').ariaLabel = t('Switch student');
  if (!cfg) return;
  fillSelects();
  if (!me || $('home').hidden || !lastCheck) return;
  const trip = currentTrip();
  rideNote = ''; // already shown in the other language
  showMe(); showPlan(); drawMap(trip, false);
  if (joinedRide) { showStatus(lastCheck, trip); showJoined(false); }
  else if (offeredRide || $('ride').children.length) showRide(offeredRide, trip);
  else { showStatus(lastCheck, trip); showPrices(cfg.prices, trip.campus); }
}

async function start() {
  applyLang();
  document.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => toggleLang(rerender); });
  try { cfg = await api('api/config'); } catch (e) { $('login').hidden = false; $('login-error').textContent = t(e.message); return; }
  fillSelects(); rerender();
  for (const id of ['lecture', 'hood', 'campus']) $(id).addEventListener('change', refresh);
  $('logout').onclick = logout;
  $('restart').onclick = () => { restartClock(); };
  $('verify-form').onsubmit = (e) => { e.preventDefault(); verify($('email').value); };
  document.querySelectorAll('[data-demo]').forEach((b) => { b.onclick = () => verify(b.dataset.demo); });
  new ResizeObserver(() => map && map.invalidateSize()).observe($('map'));
  me = store.get();
  if (me && me.session && me.profile) await openHome(); else { me = null; $('login').hidden = false; }
}
start();
