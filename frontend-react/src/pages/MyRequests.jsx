import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useLang, getSpecialityLabel } from '../LanguageContext'
import RatingModal from '../components/RatingModal'
import '../styles/garage.css'
import '../styles/home.css'

const STATUS_COLORS = {
  pending:   { bg: '#fff3e0', color: '#e67e22', border: '#e67e22' },
  accepted:  { bg: '#e8f8f0', color: '#27ae60', border: '#27ae60' },
  declined:  { bg: '#fdecea', color: '#e74c3c', border: '#e74c3c' },
  completed: { bg: '#e8f4fd', color: '#2980b9', border: '#2980b9' },
}

const URGENCY_COLORS = { emergency: '#e74c3c', urgent: '#e67e22', normal: '#27ae60' }

// Translated filter tab labels
const FILTER_LABELS = {
  en: { all:'All', pending:'Pending', accepted:'Accepted', completed:'Completed', declined:'Declined' },
  rw: { all:'Byose', pending:'Bitegereje', accepted:'Byemejwe', completed:'Byarangiye', declined:'Byanzwe' },
}

export default function MyRequests() {
  const { user, logout } = useAuth()
  const { t, lang, toggleLang } = useLang()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [ratingData, setRatingData] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    fetchRequests()
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    clearInterval(pollRef.current)
    const hasActive = requests.some(r => r.status === 'pending' || r.status === 'accepted')
    if (hasActive) {
      pollRef.current = setInterval(fetchRequests, 4000)
    }
    return () => clearInterval(pollRef.current)
  }, [requests])

  async function fetchRequests() {
    try {
      const data = await api.getUserRequests()
      setRequests(data.requests || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const labels = FILTER_LABELS[lang]

  const counts = {
    all:       requests.length,
    pending:   requests.filter(r => r.status === 'pending').length,
    accepted:  requests.filter(r => r.status === 'accepted').length,
    completed: requests.filter(r => r.status === 'completed').length,
    declined:  requests.filter(r => r.status === 'declined').length,
  }

  return (
    <div>
      {/* Navbar */}
      <nav className="navbar">
        <span className="nav-brand">{t.brand}</span>
        <div className="nav-right">
          <Link to="/home" style={{color:'#1f4fd6',textDecoration:'none',fontSize:'0.9rem'}}>{t.findMechanics}</Link>
          <span>👤 <strong>{user?.name}</strong></span>
          <button onClick={toggleLang} className="lang-btn">
            {lang === 'en' ? '🇷🇼 Kinyarwanda' : '🇬🇧 English'}
          </button>
          <button className="btn-ghost" onClick={() => { logout(); navigate('/login') }}>{t.logout}</button>
        </div>
      </nav>

      <main className="container">
        <div className="dash-header">
          <div>
            <h1 style={{margin:0}}>{t.requestHistory}</h1>
            <p style={{margin:'4px 0 0',color:'#4a5d73',fontSize:'0.9rem'}}>
              {t.totalRequests(requests.length)}
              {requests.some(r => r.status === 'pending' || r.status === 'accepted') && (
                <span style={{marginLeft:8,color:'#27ae60',fontSize:'0.82rem',fontWeight:600}}>
                  {t.liveUpdating}
                </span>
              )}
            </p>
          </div>
          <button className="btn-ghost" onClick={fetchRequests} style={{fontSize:'0.85rem'}}>
            {t.refresh}
          </button>
        </div>

        {/* Filter tabs */}
        <div className="filter-bar">
          {['all','pending','accepted','completed','declined'].map(f => (
            <button key={f} className={filter===f?'active':''} onClick={() => setFilter(f)}>
              {labels[f]}
              {counts[f] > 0 && (
                <span style={{marginLeft:6,background:'rgba(0,0,0,0.15)',borderRadius:10,padding:'1px 6px',fontSize:'0.75rem'}}>
                  {counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && (
          <p style={{textAlign:'center',color:'#7a8fa6',padding:'40px 0'}}>
            {lang === 'en' ? 'Loading your requests…' : 'Gutegereza ubusabe bwawe…'}
          </p>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{textAlign:'center',padding:'60px 0',color:'#7a8fa6'}}>
            <div style={{fontSize:'3rem',marginBottom:12}}>📭</div>
            <p style={{fontSize:'1.1rem',margin:0}}>
              {filter === 'all' ? t.noRequestsAll : t.noRequestsFilter(labels[filter])}
            </p>
            {filter === 'all' && (
              <Link to="/home">
                <button style={{marginTop:16,background:'#1f4fd6',color:'white',border:'none',padding:'10px 24px',borderRadius:8,cursor:'pointer',fontSize:'0.95rem'}}>
                  {t.findMechanicBtn}
                </button>
              </Link>
            )}
          </div>
        )}

        {!loading && filtered.map(req => (
          <RequestHistoryCard
            key={req.id}
            req={req}
            onRate={(reqId, garageName) => setRatingData({ reqId, garageName })}
            onRefresh={fetchRequests}
          />
        ))}
      </main>

      {ratingData && (
        <RatingModal
          requestId={ratingData.reqId}
          garageName={ratingData.garageName}
          onClose={() => { setRatingData(null); fetchRequests() }}
        />
      )}
    </div>
  )
}

function RequestHistoryCard({ req, onRate }) {
  const { t, lang } = useLang()
  const date    = new Date(req.created_at + 'Z').toLocaleString()
  const sc      = STATUS_COLORS[req.status] || STATUS_COLORS.pending
  const stars   = req.user_rating ? '★'.repeat(req.user_rating) + '☆'.repeat(5 - req.user_rating) : null
  const mapsUrl = `https://www.google.com/maps?q=${req.user_lat},${req.user_lon}&z=17`

  const urgencyLabel = {
    en: { emergency:'EMERGENCY', urgent:'URGENT', normal:'NORMAL' },
    rw: { emergency:'URGENCE', urgent:'BYIHUTIRWA', normal:'BISANZWE' },
  }

  const statusLabel = {
    en: { pending:'PENDING', accepted:'ACCEPTED', declined:'DECLINED', completed:'COMPLETED' },
    rw: { pending:'BITEGEREJE', accepted:'BYEMEJWE', declined:'BYANZWE', completed:'BYARANGIYE' },
  }

  return (
    <div style={{
      background:'white', borderRadius:12, padding:16,
      boxShadow:'0 4px 16px rgba(0,0,0,0.07)',
      borderLeft:`5px solid ${sc.border}`,
      marginBottom:14,
    }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8,marginBottom:10}}>
        <div>
          <div style={{fontWeight:700,fontSize:'1rem'}}>🔧 {req.garage_name}</div>
          <div style={{fontSize:'0.82rem',color:'#7a8fa6',marginTop:2}}>🕐 {date}</div>
        </div>
        <span style={{
          padding:'3px 12px', borderRadius:20, fontSize:'0.8rem',
          fontWeight:700, background:sc.bg, color:sc.color,
        }}>{statusLabel[lang]?.[req.status] || req.status.toUpperCase()}</span>
      </div>

      <div style={{fontSize:'0.88rem',color:'#4a5d73',display:'grid',gap:3}}>
        <div>🔧 <strong>{getSpecialityLabel(req.problem_type, lang)}</strong></div>
        <div>⚡ {lang === 'en' ? 'Urgency' : 'Ubwihutirwe'}: <span style={{color:URGENCY_COLORS[req.urgency],fontWeight:700}}>{urgencyLabel[lang]?.[req.urgency] || req.urgency?.toUpperCase()}</span></div>
        <div>📍 {req.user_address || `${req.user_lat?.toFixed(5)}, ${req.user_lon?.toFixed(5)}`}</div>
        {req.message && <div>💬 "{req.message}"</div>}
      </div>

      {stars && (
        <div style={{marginTop:10,padding:'8px 12px',background:'#fffbea',border:'1px solid #f0d060',borderRadius:8,fontSize:'0.88rem'}}>
          <strong>⭐ {t.yourRating}: <span style={{color:'#f39c12'}}>{stars}</span> ({req.user_rating}/5)</strong>
          {req.user_review && <div style={{color:'#4a5d73',marginTop:4}}>"{req.user_review}"</div>}
          {req.rated_at && (
            <div style={{color:'#aaa',fontSize:'0.78rem',marginTop:2}}>
              {lang === 'en' ? 'Rated on' : 'Yaratanzwe'} {new Date(req.rated_at+'Z').toLocaleDateString()}
            </div>
          )}
        </div>
      )}

      {req.status === 'accepted' && (
        <div style={{marginTop:8,padding:'8px 12px',background:'#e8f8f0',border:'1px solid #27ae60',borderRadius:8,fontSize:'0.88rem',color:'#1a6e3c'}}>
          ✅ <strong>{req.garage_name}</strong> {lang === 'en' ? 'accepted your request and is ready to help!' : 'yemeye ubusabe bwawe kandi biteguye gufasha!'}
        </div>
      )}
      {req.status === 'declined' && (
        <div style={{marginTop:8,padding:'8px 12px',background:'#fdecea',border:'1px solid #e74c3c',borderRadius:8,fontSize:'0.88rem',color:'#922b21'}}>
          ❌ <strong>{req.garage_name}</strong> {lang === 'en' ? 'was not available for this request.' : 'ntibashobora gufasha ubusabe bwawe.'}
        </div>
      )}

      <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
        {req.status === 'completed' && !req.user_rating && (
          <button
            onClick={() => onRate(req.id, req.garage_name)}
            style={{background:'#f39c12',color:'white',border:'none',padding:'7px 16px',borderRadius:8,cursor:'pointer',fontSize:'0.85rem',fontWeight:600}}
          >
            {t.rateService}
          </button>
        )}
        <a
          href={mapsUrl} target="_blank" rel="noopener"
          style={{background:'#f4f6f9',color:'#12263a',border:'1px solid #d0d7e2',textDecoration:'none',display:'inline-flex',alignItems:'center',padding:'7px 14px',borderRadius:8,fontSize:'0.85rem',fontWeight:600}}
        >
          {t.viewLocation}
        </a>
      </div>
    </div>
  )
}
