import React, { useState, useRef } from 'react';
import { sendRangerAlert } from '../services/rangerAlerts.js';

export default function RangerDispatch() {
  const [form, setForm] = useState({ zone: '', message: '', lat: '', lng: '', radius: '500', confidence: 'Medium' });
  const eventId = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const field = key => ({ disabled: busy, value: form[key], onChange: e => { eventId.current = null; setForm({ ...form, [key]: e.target.value }); } });
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setStatus('Saving alert…');
    try {
      eventId.current ||= 'manual:' + crypto.randomUUID();
      await sendRangerAlert(form, eventId.current);
      eventId.current = null;
      setStatus(`Alert saved for ${form.zone}. Rangers assigned to this zone will see it when their dashboard syncs. This does not confirm that a ranger has read it.`);
      setForm(previous => ({ ...previous, message: '' }));
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }
  return <section className="full-view dispatch-view">
    <div className="view-header"><h1>Send Ranger Alert</h1><p>Send a field verification request to the rangers assigned to a zone.</p></div>
    <form className="dispatch-form" onSubmit={submit}>
      <p>Sign in with an authorized dispatcher or admin account. <a href="/login.html">Sign in</a> · <a href="/ranger-dashboard.html">Open ranger inbox</a></p>
      <label>Zone ID<input {...field('zone')} required maxLength={100} placeholder="e.g. ZONE_NORTH" /></label>
      <p className="dispatch-help">Use the exact assigned zone ID. Everyone assigned to that zone receives the alert.</p>
      <label>Message<textarea {...field('message')} required maxLength={2000} rows={4} placeholder="Describe the incident and what the ranger should verify." /></label>
      <div className="dispatch-grid">
        <label>Latitude<input {...field('lat')} type="number" required min="-90" max="90" step="any" /></label>
        <label>Longitude<input {...field('lng')} type="number" required min="-180" max="180" step="any" /></label>
        <label>Radius (metres)<input {...field('radius')} type="number" required min="1" max="100000" step="1" /></label>
        <label>Detection confidence<select {...field('confidence')}><option>Low</option><option>Medium</option><option>High</option></select></label>
      </div>
      <button className="btn-scan" disabled={busy}>{busy ? 'Sending…' : 'Send alert to zone'}</button>
      <p role="status" aria-live="polite">{status}</p>
    </form>
  </section>;
}
