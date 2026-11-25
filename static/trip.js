'use strict';
// Family view: polls one shared trip. The token stays after '#', so it is never sent as a page URL.
const $ = (id) => document.getElementById(id);
const token = location.hash.slice(1);
const toMin = (s) => s.split(':').reduce((h, m) => h * 60 + Number(m), 0);
let map, car, trip = null;

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
function marker(latlng, cls, kids) {
  return L.marker(latlng, { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: el('div', { className: 'mk ' + cls }, ...kids) }) });
}
function positionAt(track, m) { // mirrors position_at in app/geo.py
  if (m <= track[0][0]) return track[0].slice(1);
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (m <= b[0]) {
      const f = (m - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return track[track.length - 1].slice(1);
}
function drawOnce() {
  if (map) return;
  map = L.map('map', { zoomControl: false, zoomSnap: 0.25 });
  map.attributionControl.setPrefix('');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const path = trip.track.map((p) => p.slice(1));
  L.polyline(path, { color: '#EE018D', weight: 5, opacity: 0.85 }).addTo(map);
  marker(path[0], 'mk-meet', [icon('pin')]).addTo(map);
  marker(path[path.length - 1], 'mk-campus', [icon('cap'), trip.campus]).addTo(map);
  car = marker(path[0], 'mk-car', [icon('car')]).addTo(map);
  map.fitBounds(path, { paddingTopLeft: [44, 84], paddingBottomRight: [44, 60] });
}
function show() {
  if (!trip) return;
  const go = toMin(trip.depart), end = toMin(trip.arrive), name = t(trip.name);
  const title = trip.now < go ? t('{name} is waiting for pickup', { name }) : trip.now < end ? t('{name} is on the way', { name }) : t('{name} has arrived', { name });
  const dot = el('span', { className: 'car' }, icon('car'));
  dot.style.insetInlineStart = Math.max(0, Math.min(100, ((trip.now - go) / (end - go)) * 100)) + '%';
  $('card').className = 'fam' + (trip.now >= end ? ' arrived' : '');
  $('card').replaceChildren(...[
    el('h1', { textContent: title }),
    el('div', { className: 'leg' },
      el('div', {}, el('b', { textContent: trip.depart }), el('small', { textContent: t('Pickup') })),
      el('div', { className: 'road' }, dot),
      el('div', {}, el('b', { textContent: trip.arrive }), el('small', { textContent: t(trip.campus) }))),
    el('p', { className: 'line' }, icon('walk'), t('Pickup at {place}', { place: tPickup(trip.pickup) })),
    el('p', { className: 'line' }, icon('shield'), trip.women_only ? t('Women-only car') + ' · ' + t('Shared car with {n} verified students', { n: trip.riders }) : t('Shared car with {n} verified students', { n: trip.riders })),
    el('p', { className: 'note', textContent: t('Updated {n} s ago', { n: trip.age_s }) + ' · ' + t('Simulated demo trip. The route is approximate.') }),
  ]);
}
function ended() {
  trip = null;
  $('card').className = 'fam';
  $('card').replaceChildren(el('h1', { textContent: t('This trip is no longer shared') }));
  if (car) { car.remove(); car = null; }
}
async function poll() {
  try {
    const r = await fetch('api/trips/' + encodeURIComponent(token), { cache: 'no-store' });
    if (r.status === 404) { ended(); return; } // a stopped link never comes back
    if (r.ok) {
      trip = await r.json();
      drawOnce();
      car.setLatLng(positionAt(trip.track, trip.now));
      show();
    }
  } catch {
    if (!trip) $('card').replaceChildren(el('p', { className: 'error', textContent: t("Can't reach RideSync. Check your connection and try again.") }));
  }
  setTimeout(poll, 1500);
}
applyLang();
document.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => toggleLang(() => (trip ? show() : $('card').firstChild && ended())); });
if (token) poll(); else ended();
