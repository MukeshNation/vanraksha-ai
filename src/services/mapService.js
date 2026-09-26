import maplibregl from 'maplibre-gl';
import { ALERTS, CORRIDORS, DEFORESTATION_ZONES, FIRE_HOTSPOTS, PROTECTED_ZONES } from '../data/data.js';
import { createCircleCoords, generateNDVIGrid, ndviLabel, threatColor } from '../utils/forest.js';

export function createForestMap(container, { year, onCoords, onMapClick, onSelectFeature }) {
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: { 'base-map': { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
      layers: [{ id: 'base-map', type: 'raster', source: 'base-map' }]
    },
    center: [82.8, 21.5], zoom: 5, minZoom: 4, maxZoom: 14
  });

  map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map.on('load', () => {
    addNDVI(map, year);
    addDeforestation(map);
    addFires(map);
    addProtected(map);
    addCorridors(map);
  });

  map.on('mousemove', e => onCoords?.({ lat: e.lngLat.lat, lng: e.lngLat.lng, zoom: map.getZoom() }));
  map.on('click', e => {
    const ids = ['deforestation-fill', 'protected-fill', 'fire-circles'];
    const features = map.queryRenderedFeatures(e.point, { layers: ids.filter(id => !!map.getLayer(id)) });
    if (!features.length) onMapClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    else onSelectFeature?.(features[0]);
  });

  return map;
}

function addNDVI(map, year) {
  map.addSource('ndvi-source', { type: 'geojson', data: generateNDVIGrid(year) });
  map.addLayer({ id: 'ndvi-fill', type: 'fill', source: 'ndvi-source', layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.45 } });
  map.on('click', 'ndvi-fill', e => {
    const p = e.features?.[0]?.properties;
    if (!p) return;
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<div style="min-width:180px"><div style="font-weight:700;font-size:14px;color:#3dcc73;margin-bottom:6px">🛰 NDVI Reading</div><div style="display:flex;justify-content:space-between"><span>NDVI</span><strong>${p.ndvi}</strong></div><div style="display:flex;justify-content:space-between"><span>Vegetation</span><strong>${ndviLabel(p.ndvi)}</strong></div></div>`).addTo(map);
  });
}

function addDeforestation(map) {
  const features = DEFORESTATION_ZONES.map(z => ({ type: 'Feature', properties: { name: z.name, severity: z.severity }, geometry: { type: 'Polygon', coordinates: [createCircleCoords(z.lng, z.lat, z.radius, 24)] } }));
  map.addSource('deforestation-source', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  map.addLayer({ id: 'deforestation-fill', type: 'fill', source: 'deforestation-source', paint: { 'fill-color': ['case', ['==', ['get', 'severity'], 'high'], '#ff4444', ['==', ['get', 'severity'], 'medium'], '#ff9900', '#ffdd00'], 'fill-opacity': 0.35 } });
  map.addLayer({ id: 'deforestation-stroke', type: 'line', source: 'deforestation-source', paint: { 'line-color': ['case', ['==', ['get', 'severity'], 'high'], '#ff4444', ['==', ['get', 'severity'], 'medium'], '#ff9900', '#ffdd00'], 'line-width': 1.5, 'line-dasharray': [3, 2] } });
  map.on('click', 'deforestation-fill', e => {
    const p = e.features?.[0]?.properties;
    if (!p) return;
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<div><div style="font-weight:700;color:#ff9900;margin-bottom:6px">🌳 Deforestation Zone</div><div>${p.name}</div><div style="margin-top:4px">Severity: <strong>${String(p.severity).toUpperCase()}</strong></div></div>`).addTo(map);
  });
}

function addFires(map) {
  const features = FIRE_HOTSPOTS.map(f => ({ type: 'Feature', properties: { name: f.name, intensity: f.intensity }, geometry: { type: 'Point', coordinates: [f.lng, f.lat] } }));
  map.addSource('fire-source', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  map.addLayer({ id: 'fire-halo', type: 'circle', source: 'fire-source', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'intensity'], 0.3, 16, 1, 28], 'circle-color': '#ff4444', 'circle-opacity': 0.12, 'circle-blur': 1 } });
  map.addLayer({ id: 'fire-circles', type: 'circle', source: 'fire-source', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'intensity'], 0.3, 6, 1, 12], 'circle-color': ['interpolate', ['linear'], ['get', 'intensity'], 0.3, '#ffd000', 0.7, '#ff6600', 1, '#ff2200'], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' } });
  map.on('click', 'fire-circles', e => {
    const p = e.features?.[0]?.properties;
    if (!p) return;
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<div><div style="font-weight:700;color:#ff6600">🔥 Fire Hotspot</div><div style="margin-top:5px">${p.name}</div><div>Intensity: <strong>${(Number(p.intensity) * 100).toFixed(0)}%</strong></div></div>`).addTo(map);
  });
}

function addProtected(map) {
  const features = PROTECTED_ZONES.map(z => ({ type: 'Feature', properties: { ...z, species: z.species.join(', ') }, geometry: { type: 'Polygon', coordinates: [createCircleCoords(z.lng, z.lat, Math.sqrt(z.area / 314) * 0.6, 32)] } }));
  map.addSource('protected-source', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  map.addLayer({ id: 'protected-fill', type: 'fill', source: 'protected-source', paint: { 'fill-color': ['case', ['==', ['get', 'type'], 'tiger-reserve'], '#fbbf24', ['==', ['get', 'type'], 'biosphere'], '#a855f7', ['==', ['get', 'type'], 'wildlife-sanctuary'], '#38bdf8', '#27a057'], 'fill-opacity': 0.15 } });
  map.addLayer({ id: 'protected-stroke', type: 'line', source: 'protected-source', paint: { 'line-color': ['case', ['==', ['get', 'type'], 'tiger-reserve'], '#fbbf24', ['==', ['get', 'type'], 'biosphere'], '#a855f7', ['==', ['get', 'type'], 'wildlife-sanctuary'], '#38bdf8', '#27a057'], 'line-width': 1.5 } });
  map.on('click', 'protected-fill', e => {
    const p = e.features?.[0]?.properties;
    if (!p) return;
    new maplibregl.Popup({ maxWidth: '240px' }).setLngLat(e.lngLat).setHTML(`<div><div style="font-weight:700;color:#3dcc73;margin-bottom:4px">${p.icon} ${p.name}</div><div>${p.typeName} · ${p.state}</div><div style="margin-top:5px">Area: <strong>${Number(p.area).toLocaleString()} km²</strong></div><div>NDVI: <strong>${p.ndvi}</strong></div><div>Threat: <strong style="color:${threatColor(Number(p.threat))}">${p.threat}%</strong></div></div>`).addTo(map);
  });
}

function addCorridors(map) {
  const features = CORRIDORS.map(c => ({ type: 'Feature', properties: { name: c.name, species: c.species }, geometry: { type: 'LineString', coordinates: c.points.map(p => [p[1], p[0]]) } }));
  map.addSource('corridor-source', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  map.addLayer({ id: 'corridor-line', type: 'line', source: 'corridor-source', layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' }, paint: { 'line-color': '#ffdd00', 'line-width': 3, 'line-dasharray': [4, 2], 'line-opacity': 0.85 } });
}

export function setLayerVisibility(map, layer, visible) {
  if (!map?.isStyleLoaded?.()) return;
  const layerMap = { ndvi: ['ndvi-fill'], deforestation: ['deforestation-fill', 'deforestation-stroke'], protected: ['protected-fill', 'protected-stroke'], fires: ['fire-circles', 'fire-halo'], species: ['corridor-line'], aqi: ['aqi-layer'], gbif: ['gbif-layer', 'gbif-clusters', 'gbif-cluster-count'] };
  for (const id of layerMap[layer] ?? []) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

export function updateNDVI(map, year) {
  const source = map?.getSource('ndvi-source');
  if (source) source.setData(generateNDVIGrid(year));
}

export function flyTo(map, lat, lng, zoom = 9) {
  map?.flyTo({ center: [lng, lat], zoom, duration: 1200 });
}

export function renderGBIFLayer(map, occurrences, visible = false) {
  if (!map?.isStyleLoaded?.()) return;
  if (map.getLayer('gbif-layer')) map.removeLayer('gbif-layer');
  if (map.getLayer('gbif-clusters')) map.removeLayer('gbif-clusters');
  if (map.getLayer('gbif-cluster-count')) map.removeLayer('gbif-cluster-count');
  if (map.getSource('gbif-source')) map.removeSource('gbif-source');
  const features = occurrences.map((o,i)=>({type:'Feature',properties:{species:o.species,color:o.color,dot:o.dot,emoji:o.emoji,id:i},geometry:{type:'Point',coordinates:[o.lng,o.lat]}}));
  map.addSource('gbif-source',{type:'geojson',data:{type:'FeatureCollection',features},cluster:true,clusterMaxZoom:8,clusterRadius:40});
  map.addLayer({id:'gbif-clusters',type:'circle',source:'gbif-source',filter:['has','point_count'],paint:{'circle-color':['step',['get','point_count'],'#27a057',10,'#f59e0b',30,'#ef4444'],'circle-radius':['step',['get','point_count'],14,10,20,30,28],'circle-stroke-width':2,'circle-stroke-color':'#fff'},layout:{visibility:visible?'visible':'none'}});
  map.addLayer({id:'gbif-cluster-count',type:'symbol',source:'gbif-source',filter:['has','point_count'],layout:{'text-field':'{point_count_abbreviated}','text-size':11,'text-font':['Open Sans Regular'],visibility:visible?'visible':'none'},paint:{'text-color':'#fff'}});
  map.addLayer({id:'gbif-layer',type:'circle',source:'gbif-source',filter:['!', ['has','point_count']],paint:{'circle-radius':['get','dot'],'circle-color':['get','color'],'circle-stroke-width':1.5,'circle-stroke-color':'#fff','circle-opacity':.85},layout:{visibility:visible?'visible':'none'}});
}

export function renderAQILayer(map, cities, visible=false) {
  if (!map?.isStyleLoaded?.()) return;
  if (map.getLayer('aqi-layer')) map.removeLayer('aqi-layer');
  if (map.getSource('aqi-source')) map.removeSource('aqi-source');
  const features=cities.filter(c=>Number.isFinite(Number(c.lng))&&Number.isFinite(Number(c.lat))).map(c=>({type:'Feature',properties:{city:c.city,aqi:c.aqi??'—'},geometry:{type:'Point',coordinates:[Number(c.lng),Number(c.lat)]}}));
  map.addSource('aqi-source',{type:'geojson',data:{type:'FeatureCollection',features}});
  map.addLayer({id:'aqi-layer',type:'circle',source:'aqi-source',paint:{'circle-radius':8,'circle-color':'#38bdf8','circle-stroke-color':'#fff','circle-stroke-width':1.5,'circle-opacity':.85},layout:{visibility:visible?'visible':'none'}});
}
