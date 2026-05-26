import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { useLang } from '../LanguageContext'
import '../styles/auth.css'

export default function GarageLogin() {
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { t, lang, toggleLang } = useLang()
  const navigate = useNavigate()

  useEffect(() => {
    const token  = localStorage.getItem('smf_garage_token')
    const garage = localStorage.getItem('smf_garage')
    if (token && garage) navigate('/garage/dashboard')
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!phone || !password) {
      setError(lang === 'en' ? 'Please enter phone and password.' : 'Injiza telefoni na ijambo banga.')
      return
    }
    setLoading(true)
    try {
      const data = await api.garageLogin({ phone, password })
      localStorage.setItem('smf_garage_token', data.token)
      localStorage.setItem('smf_garage', JSON.stringify(data.garage))
      navigate('/garage/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:8}}>
          <button onClick={toggleLang} className="lang-btn">
            {lang === 'en' ? '🇷🇼 Kinyarwanda' : '🇬🇧 English'}
          </button>
        </div>
        <h2>🔧 {lang === 'en' ? 'Garage Dashboard' : 'Ikibaho cya Garage'}</h2>
        <p>{lang === 'en' ? 'Sign in with your registered garage account.' : 'Injira ukoresheje konti ya garage yawe.'}</p>
        <form onSubmit={handleSubmit}>
          <label className="auth-field">
            {t.phoneNumber}
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t.phonePh} />
          </label>
          <label className="auth-field">
            {t.password}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={lang === 'en' ? 'Your password' : 'Ijambo banga ryawe'} />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" style={{ background: '#16a085' }} disabled={loading}>
            {loading ? t.loggingIn : t.loginBtn}
          </button>
        </form>
        <div className="auth-links">
          {lang === 'en' ? 'New garage?' : 'Garage nshya?'} <Link to="/garage/register">{t.registerHere}</Link><br />
          {lang === 'en' ? 'Are you a customer?' : 'Uri umukiriya?'} <Link to="/login">{lang === 'en' ? 'Go to login' : 'Jya kwinjira'}</Link>
        </div>
      </div>
    </div>
  )
}
