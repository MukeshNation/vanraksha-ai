import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { distance, fenceFeature, validFence, containsPoint } from '../utils/geofence.js';
import { sendRangerAlert } from '../services/rangerAlerts.js';
import './forest-geofences.css';

const STORAGE = 'vanaraksha-forest-geofences-v1';
const fresh = () => ({ id: crypto.randomUUID(), name: '', zone: '', shape: 'circle', center: [78.78, 29.53], radius: 1500, vertices: [], rules: { fire: true, entry: false, exit: false } });
function Icon({ name, size = 20 }) {
  const paths = { leaf: 'M20 4C11 2 3 7 5 15c2 7 13 6 15-11ZM5 20 15 10', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', fence: 'M4 5 12 2 21 7 19 18 8 22 2 14Z', bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6', arrow: 'M19 12H5m6-6-6 6 6 6', pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7v6m-3-3h6', shield: 'M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6ZM8 12l3 3 5-6', plus: 'M12 5v14M5 12h14' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.fence}/></svg>;
}
export default function ForestGeofences({ onNavigate }) {
  const [saved, setSaved] = useState(() => { try { const data = JSON.parse(localStorage.getItem(STORAGE) || '[]'); return Array.isArray(data) ? data.filter(f => !validFence(f)) : []; } catch { return []; } });
  const [draft, setDraft] = useState(fresh);
  const [view, setView] = useState('manage');
  const [drawing, setDrawing] = useState(false);
  const [status, setStatus] = useState('');
  const [mapError, setMapError] = useState('');
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState('29.5300, 78.7800');
  const mapEl = useRef(null), map = useRef(null), current = useRef({ draft, drawing }), requestId = useRef(null);
  current.current = { draft, drawing };
  useEffect(() => {
    let instance;
    try {
      instance = new maplibregl.Map({ container: mapEl.current, style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json', center: draft.center, zoom: 12 });
      map.current = instance;
      instance.addControl(new maplibregl.NavigationControl(), 'bottom-right');
      instance.on('error', () => setMapError('Basemap unavailable. Check your connection; saved area settings remain accessible.'));
      instance.on('load', () => {
        setMapError('');
        instance.addSource('boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'boundary-fill', type: 'fill', source: 'boundary', paint: { 'fill-color': '#fa795c', 'fill-opacity': .25 } });
        instance.addLayer({ id: 'boundary-line', type: 'line', source: 'boundary', paint: { 'line-color': '#eb7059', 'line-width': 2.5 } });
        instance.addSource('vertices', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'boundary-points', type: 'circle', source: 'vertices', paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': '#e36e58', 'circle-stroke-width': 2 } });
        setReady(true);
      });
      instance.on('click', e => {
        if (!current.current.drawing) return;
        const point = [Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))];
        setDraft(f => f.shape === 'circle' ? { ...f, center: point } : { ...f, vertices: [...f.vertices, point] });
        if (current.current.draft.shape === 'circle') setPosition(`${point[1]}, ${point[0]}`);
      });
    } catch { setMapError('Map is unavailable in this browser. Try a browser with WebGL support.'); }
    return () => { instance?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    const isPolygon = draft.shape === 'polygon';
    const features = !isPolygon || draft.vertices.length >= 3 ? [fenceFeature(draft)] : [];
    map.current.getSource('boundary')?.setData({ type: 'FeatureCollection', features });
    map.current.getSource('vertices')?.setData({ type: 'FeatureCollection', features: (isPolygon ? draft.vertices : [draft.center]).map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates } })) });
    map.current.getCanvas().style.cursor = drawing ? 'crosshair' : '';
  }, [draft, ready, drawing]);
  function change(values) { setDraft(f => ({ ...f, ...values })); setStatus(''); requestId.current = null; }
  function locate() {
    const parts = position.split(',').map(s => s.trim());
    const [lat, lng] = parts.map(Number);
    if (parts.length !== 2 || parts.some(s => !s) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return setStatus('Enter latitude, longitude — for example 29.53, 78.78.');
    change({ center: [lng, lat] }); map.current?.flyTo({ center: [lng, lat], zoom: 12 });
  }
  function save() {
    const error = validFence(draft); if (error) return setStatus(error);
    const next = [...saved.filter(f => f.id !== draft.id), { ...draft, name: draft.name.trim(), zone: draft.zone.trim() }];
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); setSaved(next); setDrawing(false); setStatus('Area saved in this browser. Export it to configure the detection worker.'); }
    catch { setStatus('Could not save this area. Browser storage may be full or disabled.'); }
  }
  function openFence(f) { setDraft(f); setPosition(`${f.center[1]}, ${f.center[0]}`); setDrawing(false); setStatus(''); requestId.current = null; map.current?.flyTo({ center: f.shape === 'polygon' ? f.vertices[0] : f.center, zoom: 12 }); }
  function exportFences() {
    if (!saved.length) return setStatus('Save an area before exporting.');
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'forest-geofences.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function previewDetection() {
    const error = validFence(draft); if (error) return setStatus(error);
    if (!draft.rules.fire) return setStatus('Enable fire detection to preview this rule.');
    const point = draft.shape === 'circle' ? draft.center : draft.vertices.reduce((a, p) => [a[0] + p[0] / draft.vertices.length, a[1] + p[1] / draft.vertices.length], [0, 0]);
    const matches = containsPoint(draft, point);
    setEvents(items => [{ id: crypto.randomUUID(), title: matches ? 'Fire rule matched' : 'Point outside boundary', name: draft.name, time: new Date().toLocaleTimeString(), detail: matches ? `Preview only · would route to ${draft.zone}. No alert sent.` : 'Preview point is outside this polygon. No alert sent.' }, ...items]);
    setView('events');
  }
  async function send() {
    const error = validFence(draft); if (error) return setStatus(error);
    if (!message.trim()) return setStatus('Add a message for the ranger.');
    const center = draft.shape === 'circle' ? draft.center : draft.vertices[0];
    const radius = draft.shape === 'circle' ? draft.radius : Math.ceil(Math.max(...draft.vertices.map(p => distance(center, p))));
    setBusy(true); setStatus('Sending alert…');
    try {
      requestId.current ||= 'geofence:' + crypto.randomUUID();
      await sendRangerAlert({ zone: draft.zone, message: `${draft.name}: ${message}`, lat: center[1], lng: center[0], radius, confidence: 'Medium' }, requestId.current);
      setStatus('Alert saved for the assigned zone. Ranger read confirmation is not available.');
      requestId.current = null; setMessage('');
      setEvents(items => [{ id: crypto.randomUUID(), title: 'Manual alert saved', name: draft.name, time: new Date().toLocaleTimeString(), detail: `Sent to zone ${draft.zone}` }, ...items]);
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  return <div className="fg-shell">
    <aside className="fg-rail">
      <a className="fg-brand" href="/"><span className="fg-brand-icon"><Icon name="leaf" size={27}/></span><span>VanaRaksha<small>RANGER OPERATIONS</small></span></a>
      <div className="fg-workspace">WORKSPACE</div>
      <button className="fg-nav" onClick={() => onNavigate('map')}><Icon name="grid"/>Overview</button>
      <button className="fg-nav active" onClick={() => setView('manage')}><Icon name="fence"/>Forest geofences</button>
      <div className="fg-subnav"><button className={view === 'manage' ? 'selected' : ''} onClick={() => setView('manage')}>Manage areas <span>{saved.length}</span></button><button className={view === 'events' ? 'selected' : ''} onClick={() => setView('events')}>Events <span>{events.length}</span></button></div>
      <a className="fg-nav" href="/ranger-dashboard.html"><Icon name="bell"/>Ranger inbox</a>
      <button className="fg-nav" onClick={() => onNavigate('dispatch')}><Icon name="pin"/>Send an alert</button>
      <div className="fg-rail-bottom"><div className="fg-environment"><span/>Local workspace</div><p>Define boundaries.<br/>Keep field teams informed.</p><div className="fg-profile"><span>VR</span><div>Forest operations<small>Area management</small></div></div></div>
    </aside>
    <section className="fg-editor">
      <header className="fg-editor-heading"><button aria-label="Back to overview" onClick={() => onNavigate('map')}><Icon name="arrow"/></button><span>FOREST PROTECTION</span><h1>{view === 'events' ? 'Area events' : 'Create a geofence'}</h1><p>{view === 'events' ? 'Activity from this session.' : 'A clear boundary. A faster response.'}</p></header>
      {view === 'events' ? <div className="fg-fields"><div className="fg-note">Previews are local tests. Live alerts appear in the ranger inbox.</div>{events.length ? events.map(e => <article className="fg-event" key={e.id}><small>{e.time}</small><h3>{e.title}</h3><strong>{e.name}</strong><p>{e.detail}</p></article>) : <p>No events yet. Create an area and preview its fire rule.</p>}<button className="fg-secondary" onClick={() => setView('manage')}>Back to area settings</button></div> : <>
      <fieldset className="fg-fields" disabled={busy}>
        <label>Area name<input placeholder="e.g. Corbett north patrol" value={draft.name} maxLength={100} onChange={e => change({ name: e.target.value })}/></label>
        <label>Locate on map<div className="fg-location"><Icon name="pin" size={17}/><input aria-label="Latitude, longitude" value={position} onChange={e => setPosition(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') locate(); }}/><button onClick={locate}>Go</button></div></label>
        <div className="fg-segment" aria-label="Boundary shape">{['circle', 'polygon'].map(shape => <button aria-pressed={draft.shape === shape} className={draft.shape === shape ? 'selected' : ''} key={shape} onClick={() => { change({ shape }); setDrawing(true); }}>{shape === 'circle' ? '◯ Circle' : '⬡ Polygon'}</button>)}</div>
        {draft.shape === 'circle' ? <div className="fg-radius"><div><label htmlFor="forest-radius">Patrol radius</label><strong>{(draft.radius / 1000).toFixed(1)} km</strong></div><input id="forest-radius" type="range" min="100" max="10000" step="100" value={draft.radius} onChange={e => change({ radius: Number(e.target.value) })}/><div><span>100 m</span><span>10 km</span></div></div> : <div className="fg-polygon"><span>{draft.vertices.length} boundary points</span><button onClick={() => change({ vertices: draft.vertices.slice(0, -1) })}>Undo point</button><button onClick={() => change({ vertices: [] })}>Clear</button></div>}
        <button className="fg-secondary" onClick={() => setDrawing(v => !v)}>{drawing ? 'Finish drawing' : draft.shape === 'circle' ? 'Place center on map' : 'Draw boundary on map'}</button>
        <label>Assigned ranger zone<input placeholder="e.g. ZONE_NORTH" value={draft.zone} maxLength={100} onChange={e => change({ zone: e.target.value })}/></label>
        <div className="fg-section-label"><h2>Alert settings</h2><Icon name="bell" size={18}/></div>
        {[['fire', 'Fire detected in this area', 'Route satellite detections to this zone'], ['entry', 'Entry into protected area', 'Requires a connected tracking feed'], ['exit', 'Exit from protected area', 'Requires a connected tracking feed']].map(([key, label, detail]) => <label className="fg-rule" key={key}><span>{label}<small>{detail}</small></span><input type="checkbox" checked={draft.rules[key]} onChange={e => change({ rules: { ...draft.rules, [key]: e.target.checked } })}/><span className="fg-switch"/></label>)}
        <div className="fg-note"><Icon name="shield" size={18}/><span>Saved on this device. Automatic monitoring needs a connected detection worker.</span></div>
        <button className="fg-save" onClick={save}>Save forest area <span>→</span></button>
        <button className="fg-text-button" onClick={previewDetection}>Preview fire rule · no alert sent</button>
        <div className="fg-section-label"><h2>Message your rangers</h2></div>
        <textarea aria-label="Ranger message" placeholder="Describe what the patrol team should check…" rows={3} maxLength={1800} value={message} onChange={e => { setMessage(e.target.value); requestId.current = null; }}/>
        <button className="fg-secondary" onClick={send}>{busy ? 'Sending…' : 'Send alert to assigned zone'}</button>
        <p className="fg-helper">Requires an authorized dispatcher account and database setup.</p>
        <div className="fg-section-label"><h2>Saved areas</h2><button className="fg-text-button" onClick={() => { const f = fresh(); openFence(f); }}>+ New</button></div>
        {saved.map(f => <button key={f.id} className="fg-saved" onClick={() => openFence(f)}><Icon name="fence"/><span>{f.name}<small>{f.zone} · {f.shape}</small></span></button>)}
        {!saved.length && <p className="fg-helper">Your saved forest areas will appear here.</p>}
        <button className="fg-text-button" onClick={exportFences}>Export areas for monitoring ↗</button>
      </fieldset></>}
      {status && <p className="fg-status" role="status">{status}</p>}
    </section>
    <section className="fg-map-panel" aria-label="Forest boundary map">
      <div className="fg-map" ref={mapEl}/>
      <div className="fg-map-top"><div><span className="fg-map-dot"/>FOREST BOUNDARY MAP</div><span>India · Field operations</span></div>
      <div className="fg-map-instruction"><Icon name="fence"/><span>{drawing ? draft.shape === 'circle' ? 'Click the map to place your area center' : 'Click to add boundary points, then finish drawing' : 'Define the area your rangers protect'}<small>{drawing ? 'Adjust the boundary using the controls on the left.' : 'Choose a circle or draw a custom polygon.'}</small></span></div>
      {mapError && <div className="fg-map-error" role="status">{mapError}</div>}
      <div className="fg-map-bottom"><span><i/> {draft.name || 'Untitled forest area'}</span><span>{draft.shape === 'circle' ? `${(draft.radius / 1000).toFixed(1)} km radius` : `${draft.vertices.length} boundary points`}</span></div>
    </section>
  </div>;
}
