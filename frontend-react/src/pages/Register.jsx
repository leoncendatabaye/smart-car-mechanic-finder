import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useLang } from '../LanguageContext'
import '../styles/auth.css'

export default function Register() {
  const [form, setForm]       = useState({ name: '', phone: '', email: '', password: '', confirm: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const { t, lang, toggleLang } = useLang()
  const navigate  = useNavigate()

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name || !form.phone || !form.password) {
      setError(lang === 'en' ? 'Please fill in all required fields.' : 'Uzuza ibisabwa byose.')
      return
    }
    if (form.password !== form.confirm) {
      setError(lang === 'en' ? 'Passwords do not match.' : 'Amagambo banga ntahuye.')
      return
    }
    if (form.password.length < 6) {
      setError(lang === 'en' ? 'Password must be at least 6 characters.' : 'Ijambo banga rigomba kuba nibura inyuguti 6.')
      return
    }
    setLoading(true)
    try {
      const data = await api.userRegister({
        name: form.name, phone: form.phone,
        email: form.email, password: form.password
      })
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
        <h2>{t.createAccount}</h2>
        <p>{t.registerSub}</p>
        <form onSubmit={handleSubmit}>
          <label className="auth-field">
            {t.fullName} <span style={{color:'#c0392b'}}>*</span>
            <input type="text" value={form.name} onChange={set('name')} placeholder={t.fullNamePh} />
          </label>
          <label className="auth-field">
            {t.phoneNumber} <span style={{color:'#c0392b'}}>*</span>
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder={t.phonePh} />
          </label>
          <label className="auth-field">
            {t.emailAddr} <small style={{color:'#7a8fa6',fontWeight:'normal'}}>{t.emailOptional}</small>
            <input type="email" value={form.email} onChange={set('email')} placeholder={t.emailPh} />
          </label>
          <label className="auth-field">
            {t.password} <span style={{color:'#c0392b'}}>*</span>
            <input type="password" value={form.password} onChange={set('password')} placeholder={t.passwordPh} />
          </label>
          <label className="auth-field">
            {t.confirmPass} <span style={{color:'#c0392b'}}>*</span>
            <input type="password" value={form.confirm} onChange={set('confirm')} placeholder={t.confirmPassPh} />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" disabled={loading}>
            {loading ? t.creating : t.createBtn}
          </button>
        </form>
        <div className="auth-links">
          {t.alreadyAccount} <Link to="/login">{t.loginHere}</Link><br />
          {t.areYouGarage} <Link to="/garage/register">{t.registerGarage}</Link>
        </div>
      </div>
    </div>
  )
}
