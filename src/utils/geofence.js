const R = 6371000;
const rad = n => n * Math.PI / 180;
export function distance(a, b) {
  const p = rad(b[1] - a[1]), l = rad(b[0] - a[0]);
  const h = Math.sin(p / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(l / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function circleRing(center, radius) {
  const [lng, lat] = center.map(rad), d = radius / R;
  return Array.from({ length: 65 }, (_, i) => {
    const bearing = i * 2 * Math.PI / 64;
    const y = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing));
    const x = lng + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(y));
    return [x * 180 / Math.PI, y * 180 / Math.PI];
  });
}
export function containsPoint(fence, point) {
  if (fence.shape === 'circle') return distance(fence.center, point) <= fence.radius;
  const vertices = fence.vertices;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function fenceFeature(fence) {
  const coordinates = fence.shape === 'circle' ? circleRing(fence.center, fence.radius) : [...fence.vertices, fence.vertices[0]];
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } };
}
export function validFence(fence) {
  const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85;
  if (!fence || !['circle', 'polygon'].includes(fence.shape) || typeof fence.name !== 'string' || typeof fence.zone !== 'string' || !fence.rules || ['fire', 'entry', 'exit'].some(key => typeof fence.rules[key] !== 'boolean')) return 'Invalid area settings.';
  if (!fence.name?.trim() || !fence.zone?.trim()) return 'Enter an area name and ranger zone ID.';
  if (!point(fence.center)) return 'Enter valid coordinates (latitude between −85 and 85).';
  if (fence.shape === 'circle' && (!Number.isFinite(fence.radius) || fence.radius < 100 || fence.radius > 10000)) return 'Choose a radius between 100 m and 10 km.';
  if (fence.shape === 'polygon') {
    const v = fence.vertices;
    if (!Array.isArray(v) || v.length < 3 || !v.every(point)) return 'Add at least 3 boundary points on the map.';
    const area = v.reduce((a, p, i) => { const q = v[(i + 1) % v.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
    if (Math.abs(area) < 1e-9) return 'Draw a boundary with a non-zero area.';
  }
  return null;
}
