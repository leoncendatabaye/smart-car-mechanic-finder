import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useLang } from '../LanguageContext'
import '../styles/auth.css'

export default function GarageRegister() {
  const [search, setSearch]         = useState('')
  const [allGarages, setAllGarages] = useState([])
  const [results, setResults]       = useState([])
  const [selected, setSelected]     = useState(null)
  const [phone, setPhone]           = useState('')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const [loading, setLoading]       = useState(false)
  const { t, lang, toggleLang } = useLang()

  useEffect(() => {
    api.garagesList().then(d => setAllGarages(d.garages || [])).catch(() => {})
  }, [])

  function handleSearch(val) {
    setSearch(val)
    setSelected(null)
    if (val.length < 2) { setResults([]); return }
    const q = val.toLowerCase()
    setResults(allGarages.filter(g =>
      g.name.toLowerCase().includes(q) || (g.district||'').toLowerCase().includes(q)
    ).slice(0, 20))
  }

  function selectGarage(g) {
    setSelected(g)
    setSearch(g.name)
    setResults([])
    if (g.phone) setPhone(g.phone)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!selected)           { setError(lang === 'en' ? 'Please select your garage from the list.' : 'Hitamo garage yawe ukoresheje urutonde.'); return }
    if (!phone)              { setError(lang === 'en' ? 'Please enter your phone number.' : 'Injiza numero ya telefoni yawe.'); return }
    if (!password)           { setError(lang === 'en' ? 'Please enter a password.' : 'Injiza ijambo banga.'); return }
    if (password !== confirm){ setError(lang === 'en' ? 'Passwords do not match.' : 'Amagambo banga ntahuye.'); return }
    if (password.length < 6) { setError(lang === 'en' ? 'Password must be at least 6 characters.' : 'Ijambo banga rigomba kuba nibura inyuguti 6.'); return }
    setLoading(true)
    try {
      await api.garageRegister({
        garage_name: selected.name,
        phone, email, password,
        district: selected.district || '',
        address:  selected.address  || '',
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <div className="auth-wrap">
      <div className="auth-box">
        <h2>{t.regSuccess}</h2>
        <p>{t.regSuccessSub}</p>
        <Link to="/garage"><button className="auth-btn" style={{background:'#16a085'}}>{t.goToLogin}</button></Link>
      </div>
    </div>
  )

  return (
    <div className="auth-wrap" style={{maxWidth:520}}>
      <div className="auth-box">
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:8}}>
          <button onClick={toggleLang} className="lang-btn">
            {lang === 'en' ? '🇷🇼 Kinyarwanda' : '🇬🇧 English'}
          </button>
        </div>
        <h2>{t.registerGarageTitle}</h2>
        <p>{t.registerGarageSub}</p>
        <div className="notice">{t.pendingNotice}</div>

        <form onSubmit={handleSubmit}>
          <label className="auth-field">
            {t.searchGarage} <span style={{color:'#c0392b'}}>*</span>
            <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
              placeholder={t.searchGaragePh} autoComplete="off" />
            {results.length > 0 && (
              <div className="search-results">
                {results.map(g => (
                  <div key={g.name} className="search-result-item" onClick={() => selectGarage(g)}>
                    {g.name} <span className="district-tag">{g.district}</span>
                  </div>
                ))}
              </div>
            )}
          </label>

          {selected && (
            <div className="garage-preview">
              <div>✅ {lang === 'en' ? 'Selected' : 'Wahisemo'}: <strong>{selected.name}</strong></div>
              <div>📍 {selected.district} — {selected.address || '—'}</div>
              <div>📞 {selected.phone || '—'}</div>
            </div>
          )}

          <label className="auth-field" style={{marginTop:14}}>
            {t.yourPhone} <span style={{color:'#c0392b'}}>*</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phonePh} />
          </label>
          <label className="auth-field">
            {t.emailAddr} <small style={{color:'#7a8fa6',fontWeight:'normal'}}>{t.emailOptional}</small>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.emailPh} />
          </label>
          <label className="auth-field">
            {t.password} <span style={{color:'#c0392b'}}>*</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t.passwordPh} />
          </label>
          <label className="auth-field">
            {t.confirmPass} <span style={{color:'#c0392b'}}>*</span>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={t.confirmPassPh} />
          </label>

          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" style={{background:'#16a085'}} disabled={loading}>
            {loading ? t.submitting : t.submitReg}
          </button>
        </form>

        <div className="auth-links">
          {t.alreadyReg} <Link to="/garage">{t.loginDashboard}</Link>
        </div>
      </div>
    </div>
  )
}
