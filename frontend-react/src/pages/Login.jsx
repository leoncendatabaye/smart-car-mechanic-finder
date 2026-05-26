import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useLang } from '../LanguageContext'
import '../styles/auth.css'

export default function Login() {
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { login } = useAuth()
  const { t, lang, toggleLang } = useLang()
  const navigate  = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!phone || !password) { setError(lang === 'en' ? 'Please fill in all fields.' : 'Uzuza ibisabwa byose.'); return }
    setLoading(true)
    try {
      const data = await api.userLogin({ phone, password })
      login(data.token, data.user)
      navigate('/home')
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
        <h2>👤 {lang === 'en' ? 'User Login' : 'Injira'}</h2>
        <p>{lang === 'en' ? 'Sign in to send service requests and track them.' : 'Injira kohereza ubusabe no kubureba.'}</p>
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
          <button className="auth-btn" disabled={loading}>
            {loading ? t.loggingIn : t.loginBtn}
          </button>
        </form>
        <div className="divider">— {lang === 'en' ? 'or' : 'cyangwa'} —</div>
        <button className="garage-btn" onClick={() => navigate('/garage')}>
          🔧 {lang === 'en' ? 'I am a Garage Owner' : 'Ndi Nyir\'i Garage'}
        </button>
        <div className="auth-links">
          {t.noAccount} <Link to="/register">{t.registerHere}</Link>
        </div>
      </div>
    </div>
  )
}
