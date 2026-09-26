import React from 'react';

const nav = [
  ['map','Map'], ['geofences','Forest Geofences'], ['dispatch','Send Ranger Alert'], ['timeline','Timeline'], ['zones','Protected Zones'], ['species','Species Risk'], ['scanner','Zone Scanner'],
  ['osint','OSINT'], ['tracks','Live Tracks'], ['forecast','Forecast'], ['report','Gov Report']
];

export default function Header({ activeView, onNavigate }) {
  return <header className="header" id="main-header">
    <div className="header-left"><div className="logo"><div className="logo-icon">VR</div><div className="logo-text"><span className="logo-name">VanaRaksha</span><span className="logo-tag">Forest intelligence</span></div></div></div>
    <nav className="header-nav" id="main-nav">{nav.map(([id,label]) => <button key={id} className={`nav-btn ${activeView===id?'active':''}`} onClick={() => onNavigate(id)}>{label}</button>)}</nav>
    <div className="header-right"><div className="live-badge"><span className="live-dot"></span>LIVE</div><div className="data-source-badge">NASA FIRMS + ISRO Bhuvan</div></div>
  </header>;
}
