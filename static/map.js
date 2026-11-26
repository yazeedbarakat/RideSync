'use strict';
// Base map: Google Maps (official Map Tiles API) when GOOGLE_MAPS_KEY is set, else OpenStreetMap.
// The key is visible to browsers by design, so restrict it to this site and the Map Tiles API.
const GTILES = 'https://tile.googleapis.com';
let googleReady = null; // one session token shared by every map on the page
function googleSession() {
  googleReady = googleReady || (async () => {
    const { google_key: key } = await (await fetch('api/map')).json();
    if (!key) return null;
    const body = { mapType: 'roadmap', language: 'en-US', region: 'JO', ...(devicePixelRatio > 1 ? { scale: 'scaleFactor2x', highDpi: true } : {}) };
    const r = await fetch(`${GTILES}/v1/createSession?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('createSession ' + r.status);
    return 'key=' + encodeURIComponent(key) + '&session=' + encodeURIComponent((await r.json()).session);
  })();
  return googleReady;
}
function osmBase(m) {
  m.getContainer().classList.add('osm');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m);
}
async function baseMap(m) {
  m.attributionControl.setPrefix('');
  let auth = null;
  try { auth = await googleSession(); } catch (e) { console.warn('Google Maps unavailable, using OpenStreetMap:', e.message); }
  if (!auth) { osmBase(m); return; }
  const layer = L.tileLayer(`${GTILES}/v1/2dtiles/{z}/{x}/{y}?${auth}`, { maxZoom: 20 });
  let credit = '', failed = 0, asked = 0;
  const setCredit = (text) => {
    if (credit) m.attributionControl.removeAttribution(credit);
    credit = text;
    if (text) m.attributionControl.addAttribution(text);
  };
  const updateCredit = async () => { // Google requires the copyright text for the area on screen
    const mine = ++asked, b = m.getBounds();
    const q = new URLSearchParams({ zoom: Math.round(m.getZoom()), north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    try {
      const r = await fetch(`${GTILES}/tile/v1/viewport?${auth}&${q}`);
      const text = r.ok ? String((await r.json()).copyright || '') : '';
      if (mine === asked && m.hasLayer(layer)) setCredit('Google Maps ' + text.replace(/[<>&]/g, ''));
    } catch { /* keep the last text */ }
  };
  layer.on('tileerror', () => {
    if (++failed !== 4 || !m.hasLayer(layer)) return;
    console.warn('Google Maps tiles failed, using OpenStreetMap');
    m.off('moveend', updateCredit); m.removeLayer(layer); setCredit('');
    osmBase(m);
  });
  setCredit('Google Maps');
  layer.addTo(m);
  m.on('moveend', updateCredit);
  updateCredit();
}
