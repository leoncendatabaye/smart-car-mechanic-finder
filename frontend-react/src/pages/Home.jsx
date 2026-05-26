import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleMap, Marker, InfoWindow, DirectionsRenderer } from '@react-google-maps/api'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useLang, getSpecialityLabel } from '../LanguageContext'
import RequestModal from '../components/RequestModal'
import RatingModal  from '../components/RatingModal'
import '../styles/home.css'

const MAP_CENTER = { lat: -1.9441, lng: 30.0619 }
const ICON_USER  = 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'

function makeNumberedIcon(rank, isTop) {
  const bg   = isTop ? '#27ae60' : '#e74c3c'
  const size = isTop ? 36 : 32
  const svg  = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size+8}" viewBox="0 0 ${size} ${size+8}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-1}" fill="${bg}" stroke="white" stroke-width="2"/>
    <text x="${size/2}" y="${size/2+5}" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="${isTop?14:12}" font-weight="bold" fill="white">${rank}</text>
    <polygon points="${size/2-5},${size-2} ${size/2+5},${size-2} ${size/2},${size+7}" fill="${bg}"/>
  </svg>`
  return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: { width: size, height: size+8 }, anchor: { x: size/2, y: size+8 } }
}

export default function Home() {
  const { user, logout } = useAuth()
  const { t, lang, toggleLang } = useLang()
  const navigate = useNavigate()

  // Location state
  const [userPos, setUserPos]       = useState(null)
  const [locationLabel, setLabel]   = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [manualLat, setManualLat]   = useState('')
  const [manualLng, setManualLng]   = useState('')

  // Search state
  const [problem, setProblem]       = useState('')
  const [urgency, setUrgency]       = useState('normal')
  const [status, setStatus]         = useState('')
  const [statusErr, setStatusErr]   = useState(false)
  const [results, setResults]       = useState([])
  const [specialities, setSpecialities] = useState([])

  // Load specialities on mount
  useEffect(() => {
    api.garageSpecialities()
      .then(d => setSpecialities(d.specialities || []))
      .catch(() => {})
  }, [])

  // Map state
  const [map, setMap]               = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [directions, setDirections] = useState(null)
  const geocoderRef = useRef(null)

  // Modals
  const [requestGarage, setRequestGarage] = useState(null)
  const [ratingData, setRatingData]       = useState(null)

  const { isLoaded } = { isLoaded: true }  // Maps loaded globally in main.jsx

  // Reverse geocode
  function reverseGeocode(lat, lng, cb) {
    if (!geocoderRef.current && window.google)
      geocoderRef.current = new window.google.maps.Geocoder()
    if (!geocoderRef.current) { cb(null); return }
    geocoderRef.current.geocode({ location: { lat, lng } }, (res, st) => {
      if (st === 'OK' && res?.length) cb(res[0].formatted_address)
      else cb(null)
    })
  }

  function setLocation(lat, lng) {
    setUserPos({ lat, lng })
    setLabel(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    reverseGeocode(lat, lng, addr => { if (addr) setLabel(addr) })
    if (map) map.panTo({ lat, lng })
  }

  function handleGPS() {
    if (!navigator.geolocation) { setStatus(t.locationFailed); setStatusErr(true); return }
    setStatus(t.detectingLocation); setStatusErr(false)
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation(pos.coords.latitude, pos.coords.longitude); setStatus(t.locationDetected) },
      err => {
        const msgs = { 1: t.locationDenied, 2: t.locationUnavail, 3: t.locationTimeout }
        setStatus(msgs[err.code] || t.locationFailed); setStatusErr(true)
      },
      { timeout: 8000 }
    )
  }

  function applyManual() {
    const lat = parseFloat(manualLat), lng = parseFloat(manualLng)
    if (isNaN(lat)||isNaN(lng)) { setStatus(t.coordsInvalid); setStatusErr(true); return }
    setLocation(lat, lng); setManualOpen(false); setManualLat(''); setManualLng('')
    setStatus(''); setStatusErr(false)
  }

  function handleMapClick(e) {
    const lat = e.latLng.lat(), lng = e.latLng.lng()
    setLocation(lat, lng)
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!userPos) { setStatus(t.locationNotSet); setStatusErr(true); return }
    if (!problem) { setStatus(t.problemRequired); setStatusErr(true); return }
    setStatus(t.findingMechanics); setStatusErr(false)
    try {
      const data = await api.recommend({ latitude: userPos.lat, longitude: userPos.lng, problem_type: problem, urgency })
      setResults(data.recommendations || [])
      setStatus(t.foundResults(data.count, data.district, data.search_radius_km))
      setStatusErr(false)
      setSelectedIdx(null); setDirections(null)
      if (map && data.recommendations?.length) {
        const bounds = new window.google.maps.LatLngBounds()
        bounds.extend(userPos)
        data.recommendations.forEach(r => bounds.extend({ lat: r.mechanic_latitude, lng: r.mechanic_longitude }))
        map.fitBounds(bounds, { top:80, right:40, bottom:40, left:40 })
      }
    } catch (err) {
      setStatus(err.message); setStatusErr(true)
    }
  }

  function focusGarage(idx) {
    const item = results[idx]
    if (!item || !map) return
    setSelectedIdx(idx)
    map.panTo({ lat: item.mechanic_latitude, lng: item.mechanic_longitude })
    map.setZoom(17)
    // Draw route
    if (userPos && window.google) {
      const svc = new window.google.maps.DirectionsService()
      svc.route({
        origin: userPos,
        destination: { lat: item.mechanic_latitude, lng: item.mechanic_longitude },
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (res, st) => { if (st === 'OK') setDirections(res) })
    }
    document.getElementById('map-section')?.scrollIntoView({ behavior:'smooth', block:'center' })
  }

  function handleRequestSent(reqId, garageName) {
    setRequestGarage(null)
    // Replace request button with tracker — handled in ResultCard via prop
  }

  return (
    <div>
      {/* Navbar */}
      <nav className="navbar">
        <span className="nav-brand">{t.brand}</span>
        <div className="nav-right">
          <Link to="/my-requests" style={{color:'#1f4fd6',textDecoration:'none',fontSize:'0.9rem'}}>{t.myRequests}</Link>
          <span>👤 <strong>{user?.name}</strong></span>
          <button
            onClick={toggleLang}
            className="lang-btn"
          >
            {lang === 'en' ? '🇷🇼 Kinyarwanda' : '🇬🇧 English'}
          </button>
          <button className="btn-ghost" onClick={() => { logout(); navigate('/login') }}>{t.logout}</button>
        </div>
      </nav>

      <main className="container">
        <section className="hero">
          <h1>{t.heroTitle}</h1>
          <p>{t.heroSub}</p>
        </section>

        <section className="panel">
          <form onSubmit={handleSearch}>
            <p className="location-hint">{t.locationHint}</p>
            <div className="actions" style={{marginBottom:8}}>
              <button type="button" onClick={handleGPS}>{t.useMyLocation}</button>
            </div>
            <div className="manual-toggle-row">
              <button type="button" className="btn-ghost btn-toggle" onClick={() => setManualOpen(o => !o)}>
                🔢 {manualOpen ? t.hideManual : t.enterManual}
              </button>
            </div>
            {manualOpen && (
              <div className="manual-coords-panel">
                <div className="manual-coords-grid">
                  <label>{t.latitude} <input type="number" step="any" value={manualLat} onChange={e=>setManualLat(e.target.value)} placeholder="-1.9441" /></label>
                  <label>{t.longitude} <input type="number" step="any" value={manualLng} onChange={e=>setManualLng(e.target.value)} placeholder="30.0619" /></label>
                  <button type="button" onClick={applyManual}>{t.apply}</button>
                </div>
              </div>
            )}
            {userPos && (
              <div className="coord-display">
                <span>📍 {locationLabel || `${userPos.lat.toFixed(5)}, ${userPos.lng.toFixed(5)}`}</span>
                <button type="button" className="btn-ghost" onClick={() => { setUserPos(null); setLabel('') }}>{t.clearLocation}</button>
              </div>
            )}
            <div className="grid" style={{marginTop:12}}>
              <label>{t.carProblem}
                <select value={problem} onChange={e=>setProblem(e.target.value)} required>
                  <option value="">{lang === 'en' ? '— Select a problem —' : '— Hitamo ikibazo —'}</option>
                  {specialities.map(s => (
                    <option key={s} value={s}>{getSpecialityLabel(s, lang)}</option>
                  ))}
                </select>
              </label>
              <label>{t.urgency}
                <select value={urgency} onChange={e=>setUrgency(e.target.value)}>
                  <option value="normal">{t.normal}</option>
                  <option value="urgent">{t.urgent}</option>
                  <option value="emergency">{t.emergency}</option>
                </select>
              </label>
            </div>
            <div className="actions"><button type="submit">{t.findBtn}</button></div>
          </form>
          <p style={{color: statusErr ? '#c0392b' : '#1f4fd6', minHeight:18}}>{status}</p>
        </section>

        <section className="layout">
          <div>
            <h2>{t.topRecs}</h2>
            <div className="results">
              <PersistentRequests onRate={(reqId, garageName) => setRatingData({ reqId, garageName })} />
              {results.length === 0
                ? <p style={{color:'#7a8fa6'}}>{t.noResults}</p>
                : results.map((item, idx) => (
                  <ResultCard
                    key={idx} item={item} index={idx}
                    userPos={userPos}
                    onFocus={() => focusGarage(idx)}
                    onRequest={() => setRequestGarage({ garage_id: item.mechanic_name, garage_name: item.mechanic_name, garage_address: item.address })}
                    onRate={(reqId) => setRatingData({ reqId, garageName: item.mechanic_name })}
                    problem={problem} urgency={urgency}
                  />
                ))
              }
            </div>
          </div>

          <div id="map-section">
            <h2>{t.mapView}</h2>
            <div className="map-legend">
              <span><img src="https://maps.google.com/mapfiles/ms/icons/blue-dot.png" style={{height:16,verticalAlign:'middle'}} /> {t.you}</span>
              <span><img src="https://maps.google.com/mapfiles/ms/icons/green-dot.png" style={{height:16,verticalAlign:'middle'}} /> {t.bestMatch}</span>
              <span><img src="https://maps.google.com/mapfiles/ms/icons/red-dot.png" style={{height:16,verticalAlign:'middle'}} /> {t.others}</span>
            </div>
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ height:480, borderRadius:12, border:'1px solid #d0d7e2' }}
                center={MAP_CENTER} zoom={13}
                onLoad={setMap}
                onClick={handleMapClick}
              >
                {userPos && <Marker position={userPos} icon={ICON_USER} title={t.you} zIndex={999} />}
                {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers:true, polylineOptions:{ strokeColor:'#1a73e8', strokeWeight:6 } }} />}
                {results.map((item, idx) => (
                  <Marker
                    key={idx}
                    position={{ lat: item.mechanic_latitude, lng: item.mechanic_longitude }}
                    icon={makeNumberedIcon(idx+1, idx===0)}
                    title={item.mechanic_name}
                    zIndex={100 + results.length - idx}
                    onClick={() => setSelectedIdx(selectedIdx===idx ? null : idx)}
                  />
                ))}
                {selectedIdx !== null && results[selectedIdx] && (
                  <InfoWindow
                    position={{ lat: results[selectedIdx].mechanic_latitude, lng: results[selectedIdx].mechanic_longitude }}
                    onCloseClick={() => setSelectedIdx(null)}
                  >
                    <InfoContent item={results[selectedIdx]} rank={selectedIdx+1} userPos={userPos} />
                  </InfoWindow>
                )}
              </GoogleMap>
            ) : <div style={{height:480,background:'#f4f6f9',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',color:'#7a8fa6'}}>Loading map…</div>}
          </div>
        </section>
      </main>

      {requestGarage && (
        <RequestModal
          garage={requestGarage} userPos={userPos} locationLabel={locationLabel}
          problem={problem} urgency={urgency} user={user}
          onClose={() => setRequestGarage(null)}
          onSent={(reqId, gName) => {
            setRequestGarage(null)
            // Save to localStorage immediately and show status right away
            const existing = JSON.parse(localStorage.getItem('smf_pending_requests') || '[]')
            if (!existing.find(r => r.reqId === reqId)) {
              existing.push({ reqId, garageName: gName, status: 'pending' })
              localStorage.setItem('smf_pending_requests', JSON.stringify(existing))
            }
            // Force PersistentRequests to re-read localStorage immediately
            window.dispatchEvent(new Event('smf_request_sent'))
          }}
        />
      )}
      {ratingData && !ratingData.pending && (
        <RatingModal
          requestId={ratingData.reqId} garageName={ratingData.garageName}
          onClose={() => setRatingData(null)}
        />
      )}
    </div>
  )
}

function InfoContent({ item, rank, userPos }) {
  const mapsUrl = item.google_maps_url && item.google_maps_url !== 'nan'
    ? item.google_maps_url
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mechanic_name+', Rwanda')}`
  const dirUrl = userPos
    ? `https://www.google.com/maps/dir/${userPos.lat},${userPos.lng}/${encodeURIComponent(item.mechanic_name)}`
    : '#'
  return (
    <div style={{fontFamily:'sans-serif',maxWidth:280,padding:4}}>
      <div style={{fontSize:15,fontWeight:'bold',marginBottom:6,color: rank===1?'#1a6e3c':'#c0392b'}}>
        #{rank} {item.mechanic_name}
      </div>
      <div>⭐ {Number(item.mechanic_rating).toFixed(1)} / 5.0</div>
      <div>📏 {Number(item.distance_km).toFixed(2)} km</div>
      {item.open_24hrs ? <div style={{color:'green',fontWeight:'bold'}}>✅ Open 24/7</div> : <div style={{color:'#888'}}>🕐 Regular hours</div>}
      {item.speciality && item.speciality !== 'nan' && <div>🔧 {item.speciality}</div>}
      {item.phone && item.phone !== 'nan' && <div>📞 <a href={`tel:${item.phone}`}>{item.phone}</a></div>}
      {item.address && item.address !== 'nan' && <div>📌 {item.address}</div>}
      <div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}>
        <a href={mapsUrl} target="_blank" rel="noopener" style={{background:'#1f4fd6',color:'white',padding:'6px 11px',borderRadius:6,textDecoration:'none',fontSize:12}}>🗺️ Open in Maps</a>
        <a href={dirUrl}  target="_blank" rel="noopener" style={{background:'#1a73e8',color:'white',padding:'6px 11px',borderRadius:6,textDecoration:'none',fontSize:12}}>🚗 Get Directions</a>
      </div>
    </div>
  )
}

// ── Persistent requests panel (survives page refresh) ────────────────────────
function PersistentRequests({ onRate }) {
  const { t } = useLang()
  const [requests, setRequests] = useState(() => {
    try { return JSON.parse(localStorage.getItem('smf_pending_requests') || '[]') } catch { return [] }
  })

  // Listen for new requests dispatched from onSent handler
  useEffect(() => {
    function refresh() {
      try {
        const fresh = JSON.parse(localStorage.getItem('smf_pending_requests') || '[]')
        setRequests(fresh)
      } catch {}
    }
    window.addEventListener('smf_request_sent', refresh)
    return () => window.removeEventListener('smf_request_sent', refresh)
  }, [])

  // Poll every 3 seconds — fast enough to feel near-instant
  useEffect(() => {
    if (!requests.length) return
    const intervals = requests.map(({ reqId }) => {
      // Fetch immediately on mount
      api.getRequest(reqId).then(d => { if (d.request) updateReq(reqId, d.request) }).catch(() => {})
      // Then every 3 seconds
      const iv = setInterval(async () => {
        try {
          const d = await api.getRequest(reqId)
          if (!d.request) return
          updateReq(reqId, d.request)
          // Stop only when fully done: declined OR completed+rated
          const done = d.request.status === 'declined' ||
                       (d.request.status === 'completed' && d.request.user_rating)
          if (done) clearInterval(iv)
        } catch {}
      }, 3000)
      return iv
    })
    return () => intervals.forEach(clearInterval)
  }, [requests.length])

  function updateReq(reqId, req) {
    setRequests(prev => {
      const updated = prev.map(r => r.reqId === reqId
        ? { ...r, status: req.status, rated: !!req.user_rating }
        : r
      )
      // Keep polling until: declined OR completed+rated
      const keepInStorage = updated.filter(r =>
        r.status === 'pending'   ||
        r.status === 'accepted'  ||
        (r.status === 'completed' && !r.rated)
      )
      localStorage.setItem('smf_pending_requests', JSON.stringify(keepInStorage))
      return updated
    })
  }

  if (!requests.length) return null

  return (
    <div style={{background:'white',borderRadius:10,padding:'12px 16px',boxShadow:'0 4px 16px rgba(0,0,0,0.08)',marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontWeight:700,color:'#12263a'}}>{t.activeRequests}</div>
        <button
          onClick={() => { localStorage.removeItem('smf_pending_requests'); setRequests([]) }}
          style={{background:'transparent',border:'none',color:'#7a8fa6',cursor:'pointer',fontSize:'0.82rem'}}
        >{t.clearAll}</button>
      </div>
      {requests.map(r => (
        <div key={r.reqId} style={{marginBottom:6}}>
          <StatusTracker tracker={r} onRate={(reqId) => onRate(reqId, r.garageName)} />
        </div>
      ))}
    </div>
  )
}

function ResultCard({ item, index, userPos, onFocus, onRequest, onRate, problem, urgency }) {
  const { t } = useLang()
  const [tracker, setTracker] = useState(null)
  const pollRef = useRef(null)

  function startPolling(reqId, garageName) {
    // Save to localStorage so it survives refresh
    const existing = JSON.parse(localStorage.getItem('smf_pending_requests') || '[]')
    if (!existing.find(r => r.reqId === reqId)) {
      existing.push({ reqId, garageName, status: 'pending' })
      localStorage.setItem('smf_pending_requests', JSON.stringify(existing))
    }

    setTracker({ reqId, garageName, status: 'pending' })
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getRequest(reqId)
        const req  = data.request
        setTracker(t => ({ ...t, status: req.status, rated: !!req.user_rating }))
        // Stop only when fully done: declined OR completed+rated
        const done = req.status === 'declined' ||
                     (req.status === 'completed' && req.user_rating)
        if (done) clearInterval(pollRef.current)
      } catch {}
    }, 3000)
  }

  const mapsUrl = item.google_maps_url && item.google_maps_url !== 'nan'
    ? item.google_maps_url
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mechanic_name+', Rwanda')}`

  return (
    <article className="card">
      <div className="rank">#{index+1} {item.mechanic_name || item.district}</div>
      <div>📏 {t.distance}: {item.distance_km.toFixed(2)} km</div>
      <div>⭐ {t.rating}: {item.mechanic_rating.toFixed(1)} / 5.0</div>
      <div>🕐 {t.open24}: {item.open_24hrs ? t.yes : t.no}</div>
      {item.speciality && item.speciality !== 'nan' && <div>🔧 {item.speciality}</div>}
      {item.phone && item.phone !== 'nan' && <div>📞 <a href={`tel:${item.phone}`}>{item.phone}</a></div>}
      {item.address && item.address !== 'nan' && <div style={{fontSize:'0.85rem',color:'#4a5d73'}}>📌 {item.address}</div>}
      <div>🎯 {t.suitability}: {(item.score * 100).toFixed(1)}%</div>

      <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
        <button className="focus-map-btn" onClick={onFocus}>{t.showOnMap}</button>
        {!tracker && (
          <button className="request-btn" onClick={onRequest}>{t.requestService}</button>
        )}
      </div>

      {tracker && <StatusTracker tracker={tracker} onRate={onRate} />}
    </article>
  )
}

function StatusTracker({ tracker, onRate }) {
  const { t } = useLang()
  if (tracker.status === 'pending') return (
    <div className="status-pending">{t.pending(tracker.garageName)}</div>
  )
  if (tracker.status === 'accepted') return (
    <div className="status-accepted">{t.accepted(tracker.garageName)}</div>
  )
  if (tracker.status === 'declined') return (
    <div className="status-declined">{t.declined(tracker.garageName)}</div>
  )
  if (tracker.status === 'completed') return (
    <div className="status-completed">
      {t.completed(tracker.garageName)}
      {!tracker.rated && (
        <div style={{marginTop:8}}>
          <button className="rate-btn" onClick={() => onRate(tracker.reqId)}>{t.rateBtn}</button>
        </div>
      )}
      {tracker.rated && <div style={{marginTop:6,color:'#7a8fa6'}}>{t.thankRating}</div>}
    </div>
  )
  return null
}
