import { supabase } from './supabaseClient.js';

export function validateAlert(input) {
  const zone = input.zone.trim();
  const message = input.message.trim();
  const lat = Number(input.lat), lng = Number(input.lng), radius = Number(input.radius);
  if (!zone || zone.length > 100) throw new Error('Enter a valid zone ID.');
  if (!message || message.length > 2000) throw new Error('Enter a message of 1–2000 characters.');
  if (String(input.lat).trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Enter a valid latitude.');
  if (String(input.lng).trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Enter a valid longitude.');
  if (!Number.isFinite(radius) || !Number.isInteger(radius) || radius <= 0 || radius > 100000) throw new Error('Radius must be between 1 and 100000 metres.');
  if (!['Low', 'Medium', 'High'].includes(input.confidence)) throw new Error('Select a valid confidence.');
  return { p_zone: zone, p_message: message, p_lat: lat, p_lng: lng, p_radius: radius, p_confidence: input.confidence };
}

export async function sendRangerAlert(input, eventId) {
  const payload = validateAlert(input);
  const { data, error } = await supabase.rpc('dispatch_ranger_alert', { ...payload, p_event_id: eventId });
  if (error) throw new Error('Alert was not confirmed as saved. Check your connection, dispatcher permissions and database setup before retrying.');
  return data;
}
