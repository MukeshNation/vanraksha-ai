import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../ranger-dashboard.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^\s*import .*;$/gm, '');

async function run({ session = true, profile = { zone_id: 'ZONE_NORTH' }, profileError = null, alerts = [], alertsError = null, mapFails = false } = {}) {
  const elements = new Map();
  const element = () => ({ children: [], textContent: '', style: {}, classList: { add() {}, remove() {} }, append(...items) { this.children.push(...items); }, appendChild(item) { this.append(item); }, replaceChildren() { this.children = []; }, setAttribute() {}, addEventListener() {}, innerHTML: '' });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const requests = [];
  let maps = 0;
  let poll;
  const supabase = {
    auth: { getSession: async () => ({ data: { session: session ? { user: { email: 'ranger@example.com' } } : null } }) },
    from(table) {
      requests.push(table);
      const query = { select() { return this; }, eq() { return this; }, order() { return this; }, maybeSingle() { return this; }, abortSignal() { return Promise.resolve(table === 'rangers' ? { data: profile, error: profileError } : { data: alerts, error: alertsError }); } };
      return query;
    },
  };
  const context = { supabase, document: { getElementById: get, createElement: element, addEventListener() {} }, window: { location: {}, addEventListener() {} }, console: { error() {} }, AbortSignal, setTimeout() {}, clearTimeout() {}, setInterval(callback) { poll = callback; }, clearInterval() {}, maplibregl: { Map: class { constructor() { maps++; if (mapFails) throw Error('WebGL unavailable'); } on() {} } } };
  vm.runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return { poll: async () => { await poll(); }, elements, requests, maps, location: context.window.location, text: JSON.stringify(get('alert-list')) };
}

test('signed-out visitors go to login', async () => {
  const result = await run({ session: false });
  assert.equal(result.location.href, '/login.html');
  assert.equal(result.maps, 0);
});
test('missing ranger profile keeps map and persistent setup guidance', async () => {
  const result = await run({ profile: null });
  assert.equal(result.maps, 1);
  assert.match(result.text, /Ranger setup required/);
  assert.match(result.text, /Try again/);
  assert.deepEqual(result.requests, ['rangers']);
});
test('profile query failures remain visible', async () => {
  const result = await run({ profileError: { message: 'permission denied' } });
  assert.match(result.text, /Dashboard unavailable/);
  assert.match(result.text, /access permissions/);
});
test('no alerts shows All Clear', async () => {
  const result = await run();
  assert.match(result.elements.get('alert-list').innerHTML, /All Clear/);
});
test('alerts errors show retry instead of empty sidebar', async () => {
  const result = await run({ alertsError: { message: 'network failure' } });
  assert.match(result.text, /Alerts unavailable/);
  assert.match(result.text, /Try again/);
});
test('map failure does not prevent alert loading', async () => {
  const result = await run({ mapFails: true });
  assert.deepEqual(result.requests, ['rangers', 'alerts']);
  assert.match(result.elements.get('map-status').textContent, /Map is unavailable/);
  assert.match(result.elements.get('alert-list').innerHTML, /All Clear/);
});
test('pending alert is rendered', async () => {
  const result = await run({ alerts: [{ id: 1, confidence: 'Medium', lat: 30.1, lng: 78.5, radius_m: 500, created_at: '2026-09-26T10:00:00Z' }] });
  assert.match(result.text, /30.10000/);
  assert.match(result.text, /View Map Route/);
});


test('new alerts notify once and display the ranger message as text', async () => {
  const alerts = [];
  const result = await run({ alerts });
  alerts.push({ id: 42, message: '<b>Verify smoke</b>', confidence: 'High', lat: 30, lng: 78, radius_m: 500, created_at: '2026-09-26T10:00:00Z' });
  await result.poll();
  assert.equal(result.elements.get('toast-container').children.length, 1);
  assert.equal(result.elements.get('alert-count').textContent, '(1)');
  assert.match(JSON.stringify(result.elements.get('alert-list')), /<b>Verify smoke<\/b>/);
  await result.poll();
  assert.equal(result.elements.get('toast-container').children.length, 1);
});
