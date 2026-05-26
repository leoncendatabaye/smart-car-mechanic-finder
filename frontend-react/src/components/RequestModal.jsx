import { useState, useEffect } from 'react'
import { api } from '../api'
import { useLang, getSpecialityLabel } from '../LanguageContext'
import '../styles/modal.css'

export default function RequestModal({ garage, userPos, locationLabel, problem, urgency, user, onClose, onSent }) {
  const { t, lang } = useLang()
  const [name, setName]       = useState(user?.name || '')
  const [phone, setPhone]     = useState(user?.phone || '')
  const [prob, setProb]       = useState(problem || '')
  const [specialities, setSpecialities] = useState([])

  useEffect(() => {
    api.garageSpecialities()
      .then(d => setSpecialities(d.specialities || []))
      .catch(() => {})
  }, [])
  const [urg, setUrg]         = useState(urgency || 'normal')
  const [message, setMessage] = useState('')
  const [status, setStatus]   = useState('')
  const [loading, setLoading] = useState(false)

  const labels = {
    en: {
      title:       '🚗 Request Service',
      sendingTo:   'Sending request to:',
      yourName:    'Your Name',
      yourPhone:   'Your Phone',
      carProblem:  'Car Problem',
      urgency:     'Urgency',
      normal:      'Normal',
      urgent:      'Urgent',
      emergency:   'Emergency',
      message:     'Additional Message',
      messagePh:   'Describe your problem…',
      sendBtn:     '📤 Send Request',
      sending:     'Sending…',
      cancel:      'Cancel',
      nameRequired:'Please enter your name.',
      probRequired:'Please enter the car problem.',
      locRequired: 'Location not set.',
      sent:        (g) => `✅ Request sent to ${g}!`,
    },
    rw: {
      title:       '🚗 Saba Serivisi',
      sendingTo:   'Kohereza ubusabe kuri:',
      yourName:    'Amazina Yawe',
      yourPhone:   'Telefoni Yawe',
      carProblem:  "Ikibazo cy'Imodoka",
      urgency:     'Ubwihutirwe',
      normal:      'Bisanzwe',
      urgent:      'Byihutirwa',
      emergency:   'Urgence',
      message:     'Ubutumwa Bwiyongera',
      messagePh:   'Sobanura ikibazo cyawe…',
      sendBtn:     '📤 Ohereza Ubusabe',
      sending:     'Biratumwa…',
      cancel:      'Reka',
      nameRequired:'Injiza amazina yawe.',
      probRequired:"Injiza ikibazo cy'imodoka.",
      locRequired: 'Aho uri ntikubonetse.',
      sent:        (g) => `✅ Ubusabe bwoherejwe kuri ${g}!`,
    },
  }

  const L = labels[lang]

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name)    { setStatus(L.nameRequired); return }
    if (!prob)    { setStatus(L.probRequired); return }
    if (!userPos) { setStatus(L.locRequired);  return }
    setLoading(true)
    try {
      const data = await api.sendRequest({
        garage_id:    garage.garage_id,
        garage_name:  garage.garage_name,
        user_name:    name,
        user_phone:   phone,
        user_lat:     userPos.lat,
        user_lon:     userPos.lng,
        user_address: locationLabel || '',
        problem_type: prob,
        urgency:      urg,
        message,
      })
      setStatus(L.sent(garage.garage_name))
      onSent(data.request.id, garage.garage_name)
      setTimeout(onClose, 1500)
    } catch (err) {
      setStatus(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>{L.title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="modal-garage-label">{L.sendingTo} <strong>{garage.garage_name}</strong></p>
        <form onSubmit={handleSubmit}>
          <div className="modal-grid">
            <label>{L.yourName} <span className="required">*</span>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder={lang === 'en' ? 'e.g. Jean Pierre' : 'urugero: Jean Pierre'} />
            </label>
            <label>{L.yourPhone}
              <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+250 788 000 000" />
            </label>
            <label>{L.carProblem} <span className="required">*</span>
              <select value={prob} onChange={e=>setProb(e.target.value)} required>
                <option value="">{lang === 'en' ? '— Select a problem —' : '— Hitamo ikibazo —'}</option>
                {specialities.map(s => (
                  <option key={s} value={s}>{getSpecialityLabel(s, lang)}</option>
                ))}
              </select>
            </label>
            <label>{L.urgency}
              <select value={urg} onChange={e=>setUrg(e.target.value)}>
                <option value="normal">{L.normal}</option>
                <option value="urgent">{L.urgent}</option>
                <option value="emergency">{L.emergency}</option>
              </select>
            </label>
          </div>
          <label style={{display:'flex',flexDirection:'column',gap:6,marginTop:10}}>
            {L.message}
            <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={3}
              placeholder={L.messagePh}
              style={{padding:10,borderRadius:8,border:'1px solid #d0d7e2',resize:'vertical',fontFamily:'inherit'}} />
          </label>
          <p style={{minHeight:18,marginTop:8,fontSize:'0.9rem',color: status.startsWith('✅')?'#16a085':'#c0392b'}}>{status}</p>
          <div className="modal-actions">
            <button type="submit" disabled={loading}>{loading ? L.sending : L.sendBtn}</button>
            <button type="button" className="btn-ghost" onClick={onClose}>{L.cancel}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
