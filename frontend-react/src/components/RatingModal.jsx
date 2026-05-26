import { useState } from 'react'
import { api } from '../api'
import { useLang } from '../LanguageContext'
import '../styles/modal.css'

const LABELS_EN = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent']
const LABELS_RW = ['', 'Bibi', 'Bisanzwe', 'Byiza', 'Byiza Cyane', 'Bidasubirwaho']

export default function RatingModal({ requestId, garageName, onClose }) {
  const { lang } = useLang()
  const [stars, setStars]   = useState(0)
  const [hover, setHover]   = useState(0)
  const [review, setReview] = useState('')
  const [status, setStatus] = useState('')
  const [done, setDone]     = useState(false)
  const [loading, setLoading] = useState(false)

  const L = {
    en: {
      title:      '⭐ Rate Your Service',
      question:   'How was your experience at',
      clickStar:  'Click a star to rate',
      reviewLabel:'Leave a review (optional)',
      reviewPh:   'Describe your experience…',
      submitBtn:  '📤 Submit Rating',
      submitting: 'Submitting…',
      skip:       'Skip',
      selectStar: 'Please select a star rating.',
      thanks:     (n) => `✅ Thank you! Your ${n}★ rating has been saved.`,
    },
    rw: {
      title:      '⭐ Tanga Amanota',
      question:   'Serivisi yari ite kuri',
      clickStar:  'Kanda inyenyeri gutanga amanota',
      reviewLabel:'Andika ibitekerezo (si ngombwa)',
      reviewPh:   'Sobanura uburambe bwawe…',
      submitBtn:  '📤 Ohereza Amanota',
      submitting: 'Biratumwa…',
      skip:       'Reka',
      selectStar: 'Hitamo amanota y\'inyenyeri.',
      thanks:     (n) => `✅ Urakoze! Amanota yawe ya ${n}★ yabitswe.`,
    },
  }[lang]

  const starLabels = lang === 'en' ? LABELS_EN : LABELS_RW

  async function handleSubmit() {
    if (!stars) { setStatus(L.selectStar); return }
    setLoading(true)
    try {
      await api.rateRequest(requestId, { rating: stars, review })
      setDone(true)
      setStatus(L.thanks(stars))
      setTimeout(onClose, 2500)
    } catch (err) {
      setStatus(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{maxWidth:420}}>
        <div className="modal-header">
          <h3>{L.title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="modal-garage-label">{L.question} <strong>{garageName}</strong>?</p>

        <div style={{display:'flex',gap:8,fontSize:'2rem',cursor:'pointer',margin:'12px 0',justifyContent:'center'}}>
          {[1,2,3,4,5].map(v => (
            <span key={v}
              style={{color: v <= (hover||stars) ? '#f39c12' : '#ccc'}}
              onMouseEnter={() => setHover(v)}
              onMouseLeave={() => setHover(0)}
              onClick={() => !done && setStars(v)}
            >{v <= (hover||stars) ? '★' : '☆'}</span>
          ))}
        </div>
        <p style={{textAlign:'center',color: stars?'#f39c12':'#7a8fa6',fontSize:'0.9rem',margin:'0 0 12px'}}>
          {starLabels[hover||stars] || L.clickStar}
        </p>

        {!done && (
          <label style={{display:'flex',flexDirection:'column',gap:6}}>
            {L.reviewLabel}
            <textarea value={review} onChange={e=>setReview(e.target.value)} rows={3}
              placeholder={L.reviewPh}
              style={{padding:10,borderRadius:8,border:'1px solid #d0d7e2',resize:'vertical',fontFamily:'inherit'}} />
          </label>
        )}

        <p style={{minHeight:18,marginTop:8,fontSize:'0.9rem',color: status.startsWith('✅')?'#16a085':'#c0392b'}}>{status}</p>

        {!done && (
          <div className="modal-actions">
            <button onClick={handleSubmit} disabled={loading}>{loading ? L.submitting : L.submitBtn}</button>
            <button className="btn-ghost" onClick={onClose}>{L.skip}</button>
          </div>
        )}
      </div>
    </div>
  )
}
