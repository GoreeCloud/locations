import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../../vendor/gc-ui/tokens.css';
import './style.css';

async function api(path, token, method = 'GET', payload) {
  const res = await fetch('/api' + path, {
    method,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}
const fmt = time => time ? new Date(time).toLocaleString() : 'Never';
const blank = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dbe8f0' } }] };
const online = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'raster', type: 'raster', source: 'osm' }],
};
function MapPanel({ positions, onlineTiles }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({ container: ref.current, style: onlineTiles ? online : blank, center: [0, 24], zoom: 1.4, attributionControl: onlineTiles });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const clean = [];
    map.on('load', () => {
      const valid = positions.filter(p => Number.isFinite(Number(p.longitude)) && Number.isFinite(Number(p.latitude)));
      if (!valid.length) return;
      for (const p of valid) {
        const marker = new maplibregl.Marker({ color: '#5146c8' })
          .setLngLat([Number(p.longitude), Number(p.latitude)])
          .setPopup(new maplibregl.Popup({ closeButton: true }).setText(p.email || 'Your check-in'));
        marker.addTo(map); clean.push(marker);
      }
      if (valid.length === 1) map.flyTo({ center: [Number(valid[0].longitude), Number(valid[0].latitude)], zoom: 11, essential: false });
      else {
        const bounds = new maplibregl.LngLatBounds();
        valid.forEach(p => bounds.extend([Number(p.longitude), Number(p.latitude)]));
        map.fitBounds(bounds, { padding: 75, maxZoom: 12, duration: 0 });
      }
    });
    return () => { clean.forEach(m => m.remove()); map.remove(); mapRef.current = null; };
  }, [positions, onlineTiles]);
  return <div className="map-panel" ref={ref} role="region" aria-label="Location map"><span className="map-hint">Private map canvas</span></div>;
}
function AuthScreen({ onToken }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [special, setSpecial] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const route = mode === 'login' ? '/v1/auth/login' : mode === 'bootstrap' ? '/v1/auth/bootstrap' : '/v1/auth/join';
      const payload = { email, password, ...(mode === 'bootstrap' ? { bootstrapToken: special } : mode === 'join' ? { inviteToken: special } : {}) };
      const result = await api(route, null, 'POST', payload);
      onToken(result.token);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="auth-shell gc-app">
    <div className="auth-header"><span className="logo-mark">◎</span><span>GoreeCloud <strong>Locations</strong></span></div>
    <div className="auth-layout">
      <section className="hero-text">
        <span className="eyebrow">YOUR WORLD. YOUR DATA.</span>
        <h1>Stay connected.<br /><em>Stay in control.</em></h1>
        <p>Private location history and trusted circles, hosted on your own infrastructure. Recording and sharing stay off until you choose otherwise.</p>
        <div className="hero-feature"><span>◉</span> Self-hosted location history</div>
        <div className="hero-feature"><span>◇</span> Explicit circle sharing</div>
        <div className="hero-feature"><span>⌁</span> No advertising or analytics trackers</div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-switch" role="group" aria-label="Sign in mode">
          {[['login','Sign in'],['join','Join a circle'],['bootstrap','First setup']].map(([value,label]) =>
            <button type="button" key={value} className={mode === value ? 'selected' : ''} onClick={() => { setMode(value); setError(''); }}>{label}</button>)}
        </div>
        <h2>{mode === 'login' ? 'Welcome back' : mode === 'bootstrap' ? 'Create owner account' : 'Accept your invitation'}</h2>
        <p className="muted">{mode === 'login' ? 'Access your private dashboard.' : mode === 'bootstrap' ? 'Use the one-time bootstrap token from the server environment.' : 'A circle owner shares a single-use invitation token with you.'}</p>
        <label>Email address<input autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" minLength={mode === 'login' ? undefined : 12} value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {mode !== 'login' && <label>{mode === 'bootstrap' ? 'Bootstrap token' : 'Invitation token'}<input type="password" value={special} onChange={e => setSpecial(e.target.value)} required /></label>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary full" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in securely' : mode === 'join' ? 'Join circle' : 'Create account'}</button>
        <p className="footnote">Sessions are stored in memory in this preview and end on reload. Use HTTPS for remote access.</p>
      </form>
    </div>
  </main>;
}
const nav = [['overview','◫','Overview'],['history','◷','History'],['circles','◎','Circles'],['privacy','◇','Privacy']];
function Dashboard({ token, onLogout }) {
  const [tab,setTab] = useState('overview');
  const [me,setMe] = useState(null);
  const [circles,setCircles] = useState([]);
  const [latest,setLatest] = useState([]);
  const [history,setHistory] = useState([]);
  const [trips,setTrips] = useState([]);
  const [tripsTruncated,setTripsTruncated] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [tiles,setTiles] = useState(false);
  const [circleName,setCircleName] = useState('');
  const [inviteToken,setInviteToken] = useState('');
  const [generatedInvite,setGeneratedInvite] = useState('');
  const [deletePassword,setDeletePassword] = useState('');
  const [deleteConfirmation,setDeleteConfirmation] = useState('');
  const [sessions,setSessions] = useState([]);
  const [sessionPassword,setSessionPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const execute = async (operation) => {
    setError(''); setNotice(''); setBusy(true);
    try { await operation(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  async function refresh() {
    const [account, group, current, old, journeys, activeSessions] = await Promise.all([
      api('/v1/me',token),api('/v1/circles',token),api('/v1/locations/latest',token),api('/v1/locations?limit=500',token),api('/v1/trips',token),api('/v1/me/sessions',token)
    ]);
    setMe(account.account); setCircles(group.circles); setLatest(current.positions); setHistory(old.positions);
    setTrips(journeys.trips); setTripsTruncated(journeys.truncated); setSessions(activeSessions.sessions);
  }
  useEffect(() => { refresh().catch(err => setError(err.message)); }, [token]);
  async function checkIn() {
    if (!me?.recording_enabled) throw new Error('Enable location recording first in Privacy.');
    if (!navigator.geolocation) throw new Error('Geolocation is unavailable in this browser.');
    const position = await new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(resolve,reject,{ enableHighAccuracy:true, timeout:15000, maximumAge:0 }));
    await api('/v1/locations',token,'POST',{
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracyM: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString(), source:'web'
    });
    await refresh(); setNotice('Check-in saved on your server.');
  }
  async function changePrivacy(data) { await api('/v1/privacy',token,'PATCH',data); await refresh(); }
  function removeCircle(circle) {
    const answer = window.prompt('Permanently delete this circle and revoke every member’s circle access? Type its exact name to confirm:', '');
    if (answer === null) return;
    if (answer !== circle.name) { setError('Circle name did not match. No changes made.'); return; }
    execute(async () => {
      await api('/v1/circles/' + circle.id, token, 'DELETE', { confirmName: answer });
      await refresh(); setGeneratedInvite(''); setNotice('Circle deleted. Member location histories are unaffected.');
    });
  }
  function deleteAccount(e) {
    e.preventDefault();
    if (deleteConfirmation !== 'DELETE ACCOUNT') { setError('Type DELETE ACCOUNT to confirm.'); return; }
    if (!window.confirm('Permanently delete this account, its stored locations, sessions, and remaining unshared circles? This cannot be undone.')) return;
    execute(async () => {
      await api('/v1/me', token, 'DELETE', { password: deletePassword, confirmation: deleteConfirmation });
      setDeletePassword(''); setDeleteConfirmation(''); onLogout();
    });
  }
  async function downloadExport() {
    const data = await api('/v1/export/geojson',token);
    const blob = new Blob([JSON.stringify(data,null,2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href=url; anchor.download='goreecloud-locations-export.geojson'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!me) return <main className="loading-screen gc-app"><span className="logo-mark">◎</span><p>Opening private workspace…</p>{error && <p role="alert" className="error">{error} <button onClick={onLogout}>Sign out</button></p>}</main>;
  const myLatest = latest.find(item => item.user_id === me.id);
  const mapPoints = latest.map(p => ({ ...p, email: p.user_id === me.id ? 'You' : p.email }));
  return <div className="shell gc-app">
    <aside className="sidebar">
      <div className="brand"><span className="logo-mark">◎</span><span>GoreeCloud<strong>Locations</strong></span></div>
      <p className="side-label">WORKSPACE</p>
      <nav aria-label="Primary">
        {nav.map(([id,icon,label]) => <button key={id} aria-current={tab===id?'page':undefined} className={tab===id?'active':''} onClick={() => setTab(id)}><span aria-hidden="true">{icon}</span>{label}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="privacy-note"><strong>◉ Private by design</strong><small>No automatic tracking. Your sharing settings control visibility.</small></div><div className="account"><span className="avatar">{me.email[0].toUpperCase()}</span><span title={me.email}>{me.email}</span></div><button className="signout" onClick={() => execute(async()=>{await api('/v1/auth/logout',token,'POST');onLogout();})}>Sign out</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs">Your space <span>/</span> {nav.find(n=>n[0]===tab)?.[2]}</div><div className="top-actions"><span className={me.recording_enabled?'pill positive':'pill'}>{me.recording_enabled?'● Recording on':'○ Recording off'}</span><button className="button secondary" onClick={()=>execute(refresh)} disabled={busy}>↻ Refresh</button></div></header>
      {error && <div className="alert error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="alert notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss notice">×</button></div>}
      {tab==='overview' && <>
        <div className="page-head"><div><span className="eyebrow">YOUR LOCATION HUB</span><h1>Where life happens.</h1><p>See your last check-in and shared circle members without giving up ownership of your data.</p></div><button className="button primary" disabled={busy || !me.recording_enabled} onClick={()=>execute(checkIn)}>◎ Check in now</button></div>
        <div className="stats"><div><span>Last check-in</span><strong>{myLatest ? fmt(myLatest.captured_at) : 'Not yet recorded'}</strong><small>Manual and imported positions</small></div><div><span>Trusted circles</span><strong>{circles.length}</strong><small>Joined and owned</small></div><div><span>History saved</span><strong>{history.length}{history.length>=500?'+':''}</strong><small>Recent entries loaded</small></div></div>
        <div className="map-wrap"><div className="panel-head"><div><h2>Live snapshot</h2><p>Latest recorded positions, not a continuous live feed</p></div><label className="map-toggle"><input type="checkbox" checked={tiles} onChange={e=>setTiles(e.target.checked)}/> Load public map tiles</label></div><MapPanel positions={mapPoints} onlineTiles={tiles}/><div className="map-footer">{tiles?'Map requests are sent to OpenStreetMap tile servers.':'External map tiles are off. Enable them only if you accept third-party tile requests.'}<span>{mapPoints.length} visible position{mapPoints.length===1?'':'s'}</span></div></div>
        <div className="panel"><h2>Last known positions</h2>{!latest.length?<p className="empty">No location is visible yet. Enable recording in Privacy and check in when you choose.</p>:<div className="entry-list">{latest.map(p=><div key={p.user_id} className="entry"><span className="person">{p.user_id===me.id?'Y':p.email[0].toUpperCase()}</span><div><strong>{p.user_id===me.id?'You':p.email}</strong><small>{fmt(p.captured_at)}</small></div><span className="coords">{Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}</span></div>)}</div>}</div>
      </>}
      {tab==='history' && <><div className="page-head"><div><span className="eyebrow">PRIVATE JOURNAL</span><h1>Your timeline</h1><p>Your history stays available to you, even when circle sharing is disabled.</p></div><button className="button secondary" onClick={()=>execute(downloadExport)} disabled={busy}>Export GeoJSON</button></div><div className="panel"><h2>Recent positions</h2><p className="muted">Showing up to 500 of your latest positions from the past 30 days.</p>{history.length?<div className="entry-list">{history.map(p=><div className="entry" key={p.id}><span className="person">⌁</span><div><strong>{fmt(p.captured_at)}</strong><small>{p.source} {p.accuracy_m!=null?'· ±'+Math.round(p.accuracy_m)+' m':''}</small></div><span className="coords">{Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)}</span></div>)}</div>:<p className="empty">No history recorded in the past 30 days.</p>}</div></>}
      {tab==='history' && <section className="panel" aria-label="Estimated trips">
        <h2>Estimated trips</h2>
        <p className="muted">Trips are calculated locally on your server from your saved points. Distances are estimates, not map-matched routes or arrival confirmations.</p>
        {tripsTruncated && <p className="muted" role="status">Only the latest 3,000 points were analyzed. Older trips may be omitted.</p>}
        {trips.length ? <div className="trip-cards">
          {trips.map((t,i)=><article className="trip-card" key={t.startedAt+'-'+i}>
            <div className="trip-card-title"><span className="person" aria-hidden="true">⌁</span><div><strong>{fmt(t.startedAt)}</strong><small>to {fmt(t.endedAt)}</small></div></div>
            <div className="trip-metrics"><span><strong>{(t.distanceMeters/1000).toFixed(1)}</strong> km estimated</span><span><strong>{Math.round(t.durationSeconds/60)}</strong> min</span><span><strong>{t.pointCount}</strong> fixes</span></div>
          </article>)}
        </div> : <p className="empty">No trips estimated yet. Several accurate, timestamped movement points are needed.</p>}
      </section>}
      {tab==='circles' && <><div className="page-head"><div><span className="eyebrow">TRUSTED PEOPLE</span><h1>Circles</h1><p>Sharing is off by default for every member. A circle cannot turn it on for you.</p></div></div>
        <div className="two-col">
          <section className="panel"><h2>Your circles</h2>{circles.map(c=><div className="circle-card" key={c.id}><div><strong>{c.name}</strong><small>{c.role==='owner'?'Circle owner':'Member'}</small></div><button className={c.sharing_enabled?'button subtle active-share':'button subtle'} disabled={busy} onClick={()=>execute(async()=>{await api('/v1/circles/'+c.id+'/sharing',token,'PATCH',{enabled:!c.sharing_enabled}); await refresh();})}>{c.sharing_enabled?'Sharing on · Disable':'Sharing off · Enable'}</button>{c.role==='owner'&&<button className="button secondary" disabled={busy} onClick={()=>execute(async()=>{const result=await api('/v1/circles/'+c.id+'/invites',token,'POST',{});setGeneratedInvite(result.inviteToken);})}>Create invite</button>}{c.role==='owner'&&<button className="button danger" disabled={busy} onClick={()=>removeCircle(c)}>Delete circle</button>}{c.role!=='owner'&&<button className="button secondary" disabled={busy} onClick={()=>execute(async()=>{await api('/v1/circles/'+c.id+'/leave',token,'POST',{});await refresh();})}>Leave</button>}</div>)}{!circles.length&&<p className="empty">Create or join a circle to begin.</p>}{generatedInvite&&<div className="invite"><strong>One-time invitation · 24 hours</strong><code>{generatedInvite}</code><button className="button secondary" onClick={()=>navigator.clipboard.writeText(generatedInvite).then(()=>setNotice('Invitation copied.'),()=>setError('Copy failed. Select the token manually.'))}>Copy token</button></div>}</section>
          <section className="panel"><h2>Manage circles</h2><form onSubmit={e=>{e.preventDefault();execute(async()=>{await api('/v1/circles',token,'POST',{name:circleName});setCircleName('');await refresh();});}}><label>New circle name<input value={circleName} onChange={e=>setCircleName(e.target.value)} maxLength="80" placeholder="e.g. Family" required /></label><button className="button primary" disabled={busy}>Create circle</button></form><hr/><form onSubmit={e=>{e.preventDefault();execute(async()=>{await api('/v1/invites/accept',token,'POST',{inviteToken});setInviteToken('');await refresh();});}}><label>Join with invitation token<input type="password" value={inviteToken} onChange={e=>setInviteToken(e.target.value)} required /></label><button className="button secondary" disabled={busy}>Accept invitation</button></form></section>
        </div>
      </>}
      {tab==='privacy' && <><div className="page-head"><div><span className="eyebrow">GORESHIELD PRIVACY CONTROLS</span><h1>Location on your terms</h1><p>Control what gets stored, how long it lasts, and who can see it.</p></div></div>
        <div className="two-col"><div className="panel"><h2>Recording</h2><p className="muted">Your browser and Android device only send positions after explicit actions in this preview. This server setting must be enabled before any position is accepted.</p><div className="setting"><div><strong>Allow location history</strong><small>Default: off</small></div><button className={me.recording_enabled?'button primary':'button secondary'} disabled={busy} onClick={()=>execute(()=>changePrivacy({recordingEnabled:!me.recording_enabled}))}>{me.recording_enabled?'Disable recording':'Enable recording'}</button></div><div className="setting"><div><strong>Retention period</strong><small>Stored positions older than this are automatically removed.</small></div><select value={me.retention_days} disabled={busy} onChange={e=>execute(()=>changePrivacy({retentionDays:Number(e.target.value)}))}>{[1,7,14,30,90,180,365].map(v=><option key={v} value={v}>{v} days</option>)}</select></div></div>
        <div className="panel"><h2>Your data</h2><p className="muted">Export positions in GeoJSON or permanently erase saved location points. These controls do not delete account or circle membership.</p><div className="action-line"><button className="button secondary" disabled={busy} onClick={()=>execute(downloadExport)}>Export positions</button><button className="button danger" disabled={busy} onClick={()=>{if(window.confirm('Permanently delete ALL saved positions for this account?'))execute(async()=>{const r=await api('/v1/me/locations',token,'DELETE');await refresh();setNotice('Deleted '+r.deleted+' positions.');});}}>Delete all locations</button></div><p className="footnote">No third-party maps load without opt-in. Sharing toggles are managed per circle and can be withdrawn at any time.</p></div></div>
      </>}
      {tab==='privacy' && <section className="panel" aria-label="Active sessions">
        <h2>Active sign-ins</h2>
        <p className="muted">Review your active server sessions and sign out other browsers or devices. Session details are limited to timestamps; no device identifiers or IP history are collected.</p>
        {sessions.length ? <div className="entry-list">{sessions.map(s =>
          <div className="entry" key={s.id}>
            <span className="person" aria-hidden="true">◇</span>
            <div><strong>{s.current ? 'This session' : 'Another session'}</strong>
              <small>Created {fmt(s.created_at)} · Expires {fmt(s.expires_at)}</small></div>
          </div>
        )}</div> : <p className="empty">No active sessions listed.</p>}
        <form onSubmit={e=>{e.preventDefault();execute(async()=>{
          const response = await api('/v1/me/sessions/revoke-others',token,'POST',{password:sessionPassword});
          setSessionPassword(''); await refresh();
          setNotice('Signed out ' + response.revoked + ' other active session(s).');
        });}}>
          <label>Confirm current password to sign out other devices
            <input type="password" autoComplete="current-password" value={sessionPassword} onChange={e=>setSessionPassword(e.target.value)} required />
          </label>
          <button className="button secondary" disabled={busy || !sessionPassword}>Sign out all other sessions</button>
        </form>
      </section>}
      {tab==='privacy' && <section className="panel" aria-label="Delete account">
        <h2>Delete account permanently</h2>
        <p className="muted">This erases your account, sessions, positions and memberships. Backup copies have their own retention period. If you own a circle with other members, delete that circle first; their personal histories are never erased by deleting your circle.</p>
        <form className="delete-account-form" onSubmit={deleteAccount}>
          <label>Current password<input autoComplete="current-password" type="password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} required /></label>
          <label>Type DELETE ACCOUNT to confirm<input autoComplete="off" value={deleteConfirmation} onChange={e=>setDeleteConfirmation(e.target.value)} required /></label>
          <button type="submit" className="button danger" disabled={busy || !deletePassword || deleteConfirmation!=='DELETE ACCOUNT'}>Permanently delete my account</button>
        </form>
      </section>}
      <footer className="app-footer">GoreeCloud Locations · Development preview <span>GoreeShield privacy · GoreeCloud Mesh integration · Wardveil security</span></footer>
    </main>
  </div>;
}
function App() {
  const [token,setToken] = useState(null);
  return token ? <Dashboard token={token} onLogout={()=>setToken(null)}/> : <AuthScreen onToken={setToken}/>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
