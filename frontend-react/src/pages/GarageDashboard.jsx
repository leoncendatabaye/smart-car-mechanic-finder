import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api'
import { api } from '../api'
import { useLang, getSpecialityLabel } from '../LanguageContext'
import '../styles/garage.css'

export default function GarageDashboard() {
  const [garage, setGarage]     = useState(null)
  const [requests, setRequests] = useState([])
  const [pending, setPending]   = useState(0)
  const [filter, setFilter]     = useState('all')
  const pollRef = useRef(null)
  const navigate = useNavigate()
  const { t, lang, toggleLang } = useLang()

  const FILTERS = ['all','pending','accepted','completed','declined']
  const filterLabels = {
    en: { all:'All', pending:'Pending', accepted:'Accepted', completed:'Completed', declined:'Declined' },
    rw: { all:'Byose', pending:'Bitegereje', accepted:'Byemejwe', completed:'Byarangiye', declined:'Byanzwe' },
  }

  useEffect(() => {
    const stored = localStorage.getItem('smf_garage')
    const token  = localStorage.getItem('smf_garage_token')
    if (!stored || !token) { navigate('/garage'); return }
    const g = JSON.parse(stored)
    setGarage(g)
    fetchRequests(g.garage_name)
    pollRef.current = setInterval(() => fetchRequests(g.garage_name), 10000)
    return () => clearInterval(pollRef.current)
  }, [])

  async function fetchRequests(name) {
    try {
      const data = await api.garageRequests(name)
      setRequests(data.requests || [])
      setPending(data.pending || 0)
    } catch {}
  }

  function logout() {
    clearInterval(pollRef.current)
    localStorage.removeItem('smf_garage_token')
    localStorage.removeItem('smf_garage')
    navigate('/garage')
  }

  async function updateStatus(id, status) {
    try {
      await api.updateStatus(id, status)
      fetchRequests(garage.garage_name)
    } catch {}
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  if (!garage) return null

  return (
    <div className="container">
      <div className="dash-header">
        <div>
          <h1>🔧 {garage.garage_name}</h1>
          <p className="live-indicator">
            <span className="pulse-dot" />
            {t.liveRefresh}
          </p>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <span>{t.pendingLabel}: <span className={`badge ${pending===0?'zero':''}`}>{pending}</span></span>
          <button onClick={toggleLang} className="lang-btn">
            {lang === 'en' ? '🇷🇼 Kinyarwanda' : '🇬🇧 English'}
          </button>
          <button className="btn-ghost" onClick={logout}>← {t.logout}</button>
        </div>
      </div>

      <div className="filter-bar">
        {FILTERS.map(f => (
          <button key={f} className={filter===f?'active':''} onClick={() => setFilter(f)}>
            {filterLabels[lang][f]}
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <p style={{textAlign:'center',color:'#7a8fa6',padding:'40px 0'}}>{t.noRequestsYet}</p>
        : filtered.map(req => (
            <RequestCard key={req.id} req={req} garage={garage} onUpdate={updateStatus} />
          ))
      }
    </div>
  )
}

function RequestCard({ req, garage, onUpdate }) {
  const { t, lang } = useLang()
  const [mapOpen, setMapOpen]       = useState(false)
  const [loadingDir, setLoadingDir] = useState(false)
  const [garagePos, setGaragePos]   = useState(null)
  const mapRef = useRef(null)

  const date = new Date(req.created_at + 'Z').toLocaleString()
  const customerPos = { lat: req.user_lat, lng: req.user_lon }
  const urgencyColor = { emergency:'#e74c3c', urgent:'#e67e22', normal:'#27ae60' }

  const urgencyLabel = {
    en: { emergency:'EMERGENCY', urgent:'URGENT', normal:'NORMAL' },
    rw: { emergency:'URGENCE', urgent:'BYIHUTIRWA', normal:'BISANZWE' },
  }

  const stars = req.user_rating
    ? '★'.repeat(req.user_rating) + '☆'.repeat(5 - req.user_rating)
    : null

  const externalDirUrl = garagePos
    ? `https://www.google.com/maps/dir/?api=1&origin=${garagePos.lat},${garagePos.lng}&destination=${req.user_lat},${req.user_lon}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${req.user_lat},${req.user_lon}&travelmode=driving`

  async function handleGetDirections() {
    setLoadingDir(true)
    setMapOpen(true)
    if (!garagePos) {
      try {
        const loc = await api.garageLocation(garage.garage_name)
        setGaragePos({ lat: loc.latitude, lng: loc.longitude })
      } catch {}
    }
    setLoadingDir(false)
  }

  useEffect(() => {
    if (!mapRef.current || !garagePos || !mapOpen) return
    const bounds = new window.google.maps.LatLngBounds()
    bounds.extend(customerPos)
    bounds.extend(garagePos)
    mapRef.current.fitBounds(bounds, { top:80, right:60, bottom:60, left:60 })
  }, [garagePos, mapOpen])

  function closeMap() { setMapOpen(false) }

  const linePath = garagePos ? [garagePos, customerPos] : []

  function straightLineKm(a, b) {
    const R = 6371
    const dLat = (b.lat - a.lat) * Math.PI / 180
    const dLon = (b.lng - a.lng) * Math.PI / 180
    const s = Math.sin(dLat/2)**2 +
              Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLon/2)**2
    return (R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s))).toFixed(2)
  }

  return (
    <div className={`request-card ${req.status}`}>
      <div className="req-header">
        <div className="req-title">
          {req.user_name}
          {req.user_phone && <> · <a href={`tel:${req.user_phone}`}>{req.user_phone}</a></>}
        </div>
        <span className={`status-badge status-${req.status}`}>{req.status.toUpperCase()}</span>
      </div>

      <div className="req-detail">🔧 <strong>{getSpecialityLabel(req.problem_type, lang)}</strong></div>
      <div className="req-detail">
        ⚡ {lang === 'en' ? 'Urgency' : 'Ubwihutirwe'}:{' '}
        <span style={{color:urgencyColor[req.urgency],fontWeight:700}}>
          {urgencyLabel[lang]?.[req.urgency] || req.urgency?.toUpperCase()}
        </span>
      </div>
      <div className="req-detail">📍 {req.user_address || `${req.user_lat?.toFixed(5)}, ${req.user_lon?.toFixed(5)}`}</div>
      {req.message && <div className="req-detail">💬 "{req.message}"</div>}
      <div className="req-detail" style={{color:'#aaa',fontSize:'0.8rem'}}>🕐 {date}</div>

      {stars && (
        <div className="rating-display">
          <strong>⭐ {t.userRated}: {stars} ({req.user_rating}/5)</strong>
          {req.user_review && <div>"{req.user_review}"</div>}
        </div>
      )}
      {!stars && req.status === 'completed' && (
        <div style={{color:'#7a8fa6',fontStyle:'italic',marginTop:6}}>{t.waitingRating}</div>
      )}

      <div className="req-actions">
        {req.status === 'pending' && <>
          <button className="btn-accept"  onClick={() => onUpdate(req.id,'accepted')}>{t.accept}</button>
          <button className="btn-decline" onClick={() => onUpdate(req.id,'declined')}>{t.decline}</button>
        </>}
        {req.status === 'accepted' &&
          <button className="btn-complete" onClick={() => onUpdate(req.id,'completed')}>{t.markComplete}</button>
        }
        <button
          className="btn-maps"
          onClick={handleGetDirections}
          disabled={loadingDir}
          style={{cursor:'pointer',border:'none'}}
        >
          {loadingDir ? t.loadingDir : t.getDirections}
        </button>
        <a
          className="btn-maps"
          href={`https://www.google.com/maps/dir/?api=1&destination=${req.user_lat},${req.user_lon}&travelmode=driving`}
          target="_blank" rel="noopener"
        >
          {t.customerLoc}
        </a>
      </div>

      {/* ── Inline map ───────────────────────────────────────────────── */}
      {mapOpen && (
        <div style={{marginTop:14,borderRadius:10,overflow:'hidden',border:'1px solid #d0d7e2'}}>
          <div style={{
            background:'#12263a',color:'white',padding:'8px 14px',
            display:'flex',justifyContent:'space-between',alignItems:'center',
            fontSize:'0.88rem',fontWeight:600,
          }}>
            <span>🗺️ {garage.garage_name} → {req.user_name}</span>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              {/* Only show navigate button after garage coordinates are loaded */}
              <a href={externalDirUrl} target="_blank" rel="noopener"
                style={{color:'white',fontSize:'0.8rem',textDecoration:'none',background:'#1a73e8',padding:'3px 10px',borderRadius:5}}>
                {t.navigateGM}
              </a>
              <button onClick={closeMap}
                style={{background:'transparent',border:'none',color:'white',cursor:'pointer',fontSize:'1rem'}}>
                ✕
              </button>
            </div>
          </div>

          {garagePos && (
            <div style={{
              background:'#f4f6f9',padding:'6px 14px',fontSize:'0.83rem',
              color:'#4a5d73',display:'flex',gap:20,flexWrap:'wrap',
              borderBottom:'1px solid #e0e6ef',
            }}>
              <span>🟢 <strong>{garage.garage_name}</strong> ({t.yourGarage})</span>
              <span>🔵 <strong>{req.user_name}</strong> ({t.customer})</span>
              <span>📏 ~{straightLineKm(garagePos, customerPos)} km {t.straightLine}</span>
            </div>
          )}

          {loadingDir ? (
            <div style={{height:340,display:'flex',alignItems:'center',justifyContent:'center',background:'#f4f6f9',color:'#7a8fa6'}}>
              {t.loadingDir}
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ height:340, width:'100%' }}
              center={customerPos}
              zoom={14}
              onLoad={m => {
                mapRef.current = m
                if (garagePos) {
                  const bounds = new window.google.maps.LatLngBounds()
                  bounds.extend(customerPos)
                  bounds.extend(garagePos)
                  m.fitBounds(bounds, { top:80, right:60, bottom:60, left:60 })
                }
              }}
              options={{ streetViewControl:false, mapTypeControl:false, fullscreenControl:true }}
            >
              <Marker
                position={customerPos}
                title={`${req.user_name} (${t.customer})`}
                icon="https://maps.google.com/mapfiles/ms/icons/blue-dot.png"
              />
              {garagePos && (
                <Marker
                  position={garagePos}
                  title={`${garage.garage_name} (${t.yourGarage})`}
                  icon="https://maps.google.com/mapfiles/ms/icons/green-dot.png"
                />
              )}
              {linePath.length === 2 && (
                <Polyline
                  path={linePath}
                  options={{ strokeColor:'#1a73e8', strokeWeight:4, strokeOpacity:0.8, geodesic:true }}
                />
              )}
            </GoogleMap>
          )}
        </div>
      )}
    </div>
  )
}
