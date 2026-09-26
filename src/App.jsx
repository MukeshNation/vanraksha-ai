import React,{useEffect,useState} from 'react';
import Header from './components/Header.jsx';
import Sidebar, { MapLayersPanel } from './components/Sidebar.jsx';
import MapDashboard from './components/MapDashboard.jsx';
import Timeline from './pages/Timeline.jsx';
import Zones from './pages/Zones.jsx';
import Species from './pages/Species.jsx';
import Scanner from './pages/Scanner.jsx';
import OSINT from './pages/OSINT.jsx';
import Tracks from './pages/Tracks.jsx';
import Forecast from './pages/Forecast.jsx';
import Report from './pages/Report.jsx';
import ForestGeofences from './pages/ForestGeofences.jsx';
import RangerDispatch from './pages/RangerDispatch.jsx';
import Landing from './pages/Landing.jsx';
import {fetchGBIFOccurrences,fetchAirQuality} from './services/api.js';
import {renderGBIFLayer,renderAQILayer,flyTo} from './services/mapService.js';
import {ALERTS} from './data/data.js';

export default function App(){
  const [activeView,setActiveView]=useState(window.location.hash === '#geofences' ? 'geofences' : 'landing'); const [year,setYear]=useState(2024); const [scanCoords,setScanCoords]=useState(null);
  const [layers,setLayers]=useState({ndvi:false,deforestation:true,protected:true,fires:true,species:false,aqi:false,gbif:false});
  const [gbif,setGbif]=useState([]); const [aqi,setAqi]=useState([]); const [trees,setTrees]=useState('2.40M'); const [fires,setFires]=useState(124);
  const mapGetter=window.__vanarakshaMap;
  useEffect(()=>{fetchGBIFOccurrences().then(setGbif);fetchAirQuality().then(setAqi);const t=setInterval(()=>{setTrees(v=>(parseFloat(v)+0.0001).toFixed(2)+'M');setFires(v=>Math.max(90,v+(Math.random()>.5?1:-1)))},3000);return()=>clearInterval(t)},[]);
  useEffect(()=>{if(window.__vanarakshaMap){renderGBIFLayer(window.__vanarakshaMap,gbif,layers.gbif);renderAQILayer(window.__vanarakshaMap,aqi,layers.aqi)}},[gbif,aqi,layers.gbif,layers.aqi]);
  const navigate=v=>{setActiveView(v);window.history.replaceState(null, '', v === 'geofences' ? '#geofences' : window.location.pathname);};
  if (activeView === 'geofences') return <ForestGeofences onNavigate={navigate}/>;
  if (activeView === 'landing') return <Landing onLaunch={() => setActiveView('map')} />;
  const main=activeView==='map'?<div className="main-layout"><Sidebar year={year} setYear={setYear} layers={layers} setLayers={setLayers} onFlyTo={(lat,lng)=>window.__vanarakshaMap&&flyTo(window.__vanarakshaMap,lat,lng)} onScanCoords={c=>{setScanCoords(c);setActiveView('scanner')}}/><MapDashboard year={year} setScanCoords={c=>{setScanCoords(c);setActiveView('scanner')}} layers={layers} onLayersChange={setLayers}/><MapLayersPanel layers={layers} setLayers={setLayers}/></div>:
  <main className="react-fullscreen">{activeView==='dispatch'&&<RangerDispatch/>}{activeView==='timeline'&&<Timeline/>}{activeView==='zones'&&<Zones onFlyTo={(lat,lng)=>{setActiveView('map');setTimeout(()=>window.__vanarakshaMap&&flyTo(window.__vanarakshaMap,lat,lng),200)}}/>}{activeView==='species'&&<Species/>}{activeView==='scanner'&&<Scanner initialCoords={scanCoords}/>} {activeView==='osint'&&<OSINT/>}{activeView==='tracks'&&<Tracks gbifVisible={layers.gbif} onShowGBIF={v=>setLayers(x=>({...x,gbif:v}))}/>} {activeView==='forecast'&&<Forecast/>}{activeView==='report'&&<Report/>}</main>;
  return <div className="app-root"><Header activeView={activeView} onNavigate={navigate}/>{main}</div>;
}
