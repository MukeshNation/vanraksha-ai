import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { createForestMap, flyTo, setLayerVisibility, updateNDVI } from '../services/mapService.js';
import { YEARLY_DATA, PROTECTED_ZONES } from '../data/data.js';

function MiniChart({ type = 'line', data, labels }) {
  const ref = useRef(null); const chartRef = useRef(null);
  useEffect(()=>{ if(!ref.current) return; chartRef.current?.destroy(); chartRef.current = new Chart(ref.current,{type,data:{labels,datasets:[{data,borderColor:'#3dcc73',backgroundColor:'rgba(61,204,115,0.08)',fill:true,tension:.4,pointRadius:0,borderRadius:3}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'rgba(200,240,218,.35)',font:{size:9},maxTicksLimit:5}},y:{grid:{color:'rgba(61,204,115,.05)'},ticks:{color:'rgba(200,240,218,.35)',font:{size:9}}}}}}); return ()=>chartRef.current?.destroy();},[data,labels]);
  return <canvas ref={ref} height="130"/>;
}

export default function MapDashboard({ year, setScanCoords, layers, onLayersChange }) {
  const mapRef = useRef(null), map = useRef(null); const [mapError,setMapError]=useState(''); const [coords,setCoords]=useState({lat:20.5937,lng:78.9629,zoom:5});
  useEffect(()=>{ if(!mapRef.current) return; map.current = createForestMap(mapRef.current,{year,onCoords:setCoords,onMapClick:setScanCoords}); map.current.on('error', event => { if (event.sourceId === 'base-map') setMapError('Basemap could not load. Check your connection and reload the page.'); }); map.current.on('idle', () => { if (map.current?.isSourceLoaded('base-map')) setMapError(''); }); window.__vanarakshaMap = map.current; return ()=>{ if(window.__vanarakshaMap===map.current) delete window.__vanarakshaMap; map.current?.remove(); }; },[]);
  useEffect(()=>{ updateNDVI(map.current,year); },[year]);
  useEffect(()=>{ Object.entries(layers).forEach(([k,v])=>setLayerVisibility(map.current,k,v)); },[layers]);
  const doFly = (lat,lng)=>flyTo(map.current,lat,lng);
  const searchZone = event => { event.preventDefault(); const query = event.currentTarget.elements.zoneSearch.value.trim().toLowerCase(); if (!query) return; const hit = PROTECTED_ZONES.find(z=>z.name.toLowerCase().includes(query)||z.state.toLowerCase().includes(query)); if (hit) doFly(hit.lat,hit.lng); };
  return <div className="map-container" id="map-view">
    <div id="map" ref={mapRef}></div>
    {mapError && <div role="status" className="map-network-status">{mapError}</div>}
    <form className="map-search-bar" onSubmit={searchZone}><span className="search-icon" aria-hidden="true">⌕</span><input id="map-search-input" name="zoneSearch" placeholder="Search state, district, or reserve" autoComplete="off"/></form>
    <div className="map-legend"><div className="legend-title">NDVI Index</div><div className="legend-gradient"></div><div className="legend-labels"><span>0.0 Bare</span><span>0.5 Moderate</span><span>1.0 Dense</span></div><div className="legend-items"><div className="legend-item"><span className="legend-dot" style={{background:'#ff4444'}}></span>Fire hotspot</div><div className="legend-item"><span className="legend-dot" style={{background:'#ff9900'}}></span>Deforestation</div><div className="legend-item"><span className="legend-dot" style={{background:'#00aaff88',border:'2px solid #00aaff'}}></span>Protected area</div><div className="legend-item"><span className="legend-dot" style={{background:'#ffdd00'}}></span>Species corridor</div></div></div>
    <div className="coords-display"><span>{coords.lat.toFixed(4)}°N</span><span className="coords-sep">|</span><span>{coords.lng.toFixed(4)}°E</span><span className="coords-sep">|</span><span>Zoom: {Math.round(coords.zoom)}</span></div>
    <button className="scan-cta" onClick={()=>setScanCoords({lat:coords.lat,lng:coords.lng})}>Click map to scan zone</button>
    <div className="map-dashboard-side"><div className="sidebar-card"><div className="card-header"><span className="card-title">Deforestation Rate</span></div><MiniChart type="bar" labels={YEARLY_DATA.years.slice(-10)} data={YEARLY_DATA.defoRate.slice(-10)}/></div><div className="sidebar-card"><div className="card-header"><span className="card-title">NDVI Trend (2000–2024)</span></div><MiniChart labels={YEARLY_DATA.years} data={YEARLY_DATA.ndvi}/></div><div className="sidebar-card"><div className="card-header"><span className="card-title">Top Threat Zones</span></div>{[['Simlipal NP',67,'#ef4444'],['Sundarbans',62,'#ef4444'],['Gulf of Mannar',55,'#f59e0b'],['Karbi Anglong',53,'#f59e0b'],['Kaziranga',45,'#fbbf24'],['Pench TR',41,'#38bdf8']].map(([n,p,c])=><div className="threat-item" key={n} style={{borderLeftColor:c}}><div style={{flex:1}}><div className="threat-name">{n}</div><div className="threat-bar-bg"><div className="threat-bar" style={{width:`${p}%`,background:c}}/></div></div><span className="threat-pct" style={{color:c}}>{p}%</span></div>)}</div></div>
  </div>;
}
