import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import '../styles/admin.css'
import '../styles/auth.css'

const ADMIN_KEY = 'smf-admin-2025'

export default function AdminPanel() {
  const [key, setKey]         = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [tab, setTab]         = useState('garages')   // garages | users | stats
  const [garages, setGarages] = useState([])
  const [users, setUsers]     = useState([])
  const [stats, setStats]     = useState(null)
  const [filter, setFilter]   = useState('all')
  const [error, setError]     = useState('')
  const pollRef = useRef(null)

  // Edit/delete modals
  const [editUser, setEditUser]     = useState(null)
  const [editGarage, setEditGarage] = useState(null)
  const [resetPwd, setResetPwd]     = useState(null)  // { id, type: 'user'|'garage', name }
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, type, name }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    try {
      const data = await api.adminGarages(key)
      if (data.error) { setError('Invalid admin key.'); return }
      setAdminKey(key)
      setGarages(data.garages || [])
      fetchAll(key)
      pollRef.current = setInterval(() => fetchAll(key), 10000)
    } catch { setError('Connection error.') }
  }

  async function fetchAll(k) {
    const [gData, uData, sData] = await Promise.all([
      api.adminGarages(k),
      fetch('/api/admin/users', { headers: { 'X-Admin-Key': k } }).then(r => r.json()),
      api.adminStats(k),
    ])
    setGarages(gData.garages || [])
    setUsers(uData.users || [])
    setStats(sData)
  }

  function logout() {
    clearInterval(pollRef.current)
    setAdminKey(''); setGarages([]); setUsers([]); setStats(null); setKey('')
  }

  async function setGarageStatus(id, status) {
    const data = await api.adminSetStatus(adminKey, id, status)
    if (data.garage) setGarages(gs => gs.map(g => g.id === id ? data.garage : g))
  }

  async function saveUser(id, name, phone) {
    await fetch(`/api/admin/user/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ name, phone }),
    })
    setEditUser(null)
    fetchAll(adminKey)
  }

  async function deleteUser(id) {
    await fetch(`/api/admin/user/${id}`, { method: 'DELETE', headers: { 'X-Admin-Key': adminKey } })
    setConfirmDelete(null)
    fetchAll(adminKey)
  }

  async function saveGarage(id, data) {
    await fetch(`/api/admin/garage-account/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify(data),
    })
    setEditGarage(null)
    fetchAll(adminKey)
  }

  async function deleteGarage(id) {
    await fetch(`/api/admin/garage-account/${id}`, { method: 'DELETE', headers: { 'X-Admin-Key': adminKey } })
    setConfirmDelete(null)
    fetchAll(adminKey)
  }

  async function resetPassword(id, type, password) {
    const url = type === 'user'
      ? `/api/admin/user/${id}/reset-password`
      : `/api/admin/garage-account/${id}/reset-password`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ password }),
    })
    setResetPwd(null)
  }

  const pending = garages.filter(g => g.status === 'pending').length
  const filteredGarages = filter === 'all' ? garages : garages.filter(g => g.status === filter)

  if (!adminKey) return (
    <div className="auth-wrap">
      <div className="auth-box">
        <h2>🔐 Admin Panel</h2>
        <form onSubmit={handleLogin}>
          <label className="auth-field">
            Admin Key
            <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Enter admin key" />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn">🔓 Enter</button>
        </form>
      </div>
    </div>
  )

  return (
    <div className="container">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1>🔐 Admin Panel</h1>
          <p className="live-indicator">
            <span className="pulse-dot" />
            Live — refreshes every 10 seconds
            {pending > 0 && <span style={{color:'#e67e22',fontWeight:700}}> ({pending} pending verification)</span>}
          </p>
        </div>
        <button className="btn-ghost" onClick={logout}>← Logout</button>
      </div>

      {/* Main tabs */}
      <div className="filter-bar" style={{marginBottom:20}}>
        {[['garages','🔧 Garages'],['users','👤 Users'],['stats','📊 Statistics']].map(([t,label]) => (
          <button key={t} className={tab===t?'active':''} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {/* ── GARAGES TAB ─────────────────────────────────────────────────── */}
      {tab === 'garages' && (
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <h2 style={{margin:0}}>Garage Accounts ({garages.length})</h2>
            <div className="filter-bar" style={{margin:0}}>
              {['all','pending','verified','rejected'].map(f => (
                <button key={f} className={filter===f?'active':''} onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {filteredGarages.length === 0
            ? <p style={{textAlign:'center',color:'#7a8fa6',padding:'40px 0'}}>No garages found.</p>
            : filteredGarages.map(g => (
              <div key={g.id} className={`garage-card ${g.status}`}>
                <div className="g-header">
                  <div className="g-name">🔧 {g.garage_name}</div>
                  <span className={`status-pill status-${g.status}`}>{g.status}</span>
                </div>
                <div className="g-detail">📞 {g.phone}</div>
                <div className="g-detail">📍 {g.district}{g.address ? ` — ${g.address}` : ''}</div>
                <div className="g-detail" style={{color:'#aaa',fontSize:'0.8rem'}}>🕐 {new Date(g.created_at+'Z').toLocaleString()}</div>
                <div className="g-actions" style={{flexWrap:'wrap'}}>
                  {g.status === 'pending'  && <><button className="btn-verify" onClick={() => setGarageStatus(g.id,'verified')}>✅ Verify</button><button className="btn-reject" onClick={() => setGarageStatus(g.id,'rejected')}>❌ Reject</button></>}
                  {g.status === 'verified' && <button className="btn-reject" onClick={() => setGarageStatus(g.id,'rejected')}>❌ Revoke</button>}
                  {g.status === 'rejected' && <button className="btn-verify" onClick={() => setGarageStatus(g.id,'verified')}>✅ Re-verify</button>}
                  <button className="btn-edit" onClick={() => setEditGarage({...g})}>✏️ Edit</button>
                  <button className="btn-pwd"  onClick={() => setResetPwd({id:g.id,type:'garage',name:g.garage_name})}>🔑 Reset Password</button>
                  <button className="btn-del"  onClick={() => setConfirmDelete({id:g.id,type:'garage',name:g.garage_name})}>🗑️ Delete</button>
                </div>
              </div>
            ))
          }
        </>
      )}

      {/* ── USERS TAB ───────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <>
          <h2 style={{marginBottom:12}}>Registered Users ({users.length})</h2>
          {users.length === 0
            ? <p style={{textAlign:'center',color:'#7a8fa6',padding:'40px 0'}}>No users registered yet.</p>
            : users.map(u => (
              <div key={u.id} className="garage-card verified">
                <div className="g-header">
                  <div className="g-name">👤 {u.name}</div>
                  <span style={{fontSize:'0.82rem',color:'#7a8fa6'}}>{u.request_count} request{u.request_count!==1?'s':''}</span>
                </div>
                <div className="g-detail">📞 {u.phone}</div>
                <div className="g-detail" style={{color:'#aaa',fontSize:'0.8rem'}}>🕐 Joined: {new Date(u.created_at+'Z').toLocaleString()}</div>
                <div className="g-actions">
                  <button className="btn-edit" onClick={() => setEditUser({...u})}>✏️ Edit</button>
                  <button className="btn-pwd"  onClick={() => setResetPwd({id:u.id,type:'user',name:u.name})}>🔑 Reset Password</button>
                  <button className="btn-del"  onClick={() => setConfirmDelete({id:u.id,type:'user',name:u.name})}>🗑️ Delete</button>
                </div>
              </div>
            ))
          }
        </>
      )}

      {/* ── STATS TAB ───────────────────────────────────────────────────── */}
      {tab === 'stats' && stats && <StatsSection stats={stats} />}

      {/* ── MODALS ──────────────────────────────────────────────────────── */}
      {editUser && <EditUserModal user={editUser} onSave={saveUser} onClose={() => setEditUser(null)} />}
      {editGarage && <EditGarageModal garage={editGarage} onSave={saveGarage} onClose={() => setEditGarage(null)} />}
      {resetPwd && <ResetPasswordModal item={resetPwd} onSave={resetPassword} onClose={() => setResetPwd(null)} />}
      {confirmDelete && (
        <ConfirmDeleteModal
          item={confirmDelete}
          onConfirm={() => confirmDelete.type === 'user' ? deleteUser(confirmDelete.id) : deleteGarage(confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ user, onSave, onClose }) {
  const [name, setName]   = useState(user.name)
  const [phone, setPhone] = useState(user.phone)
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-box" style={{maxWidth:400}}>
        <div className="modal-header"><h3>✏️ Edit User</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <label className="auth-field">Name <input value={name} onChange={e=>setName(e.target.value)} /></label>
        <label className="auth-field">Phone <input value={phone} onChange={e=>setPhone(e.target.value)} /></label>
        <div className="modal-actions">
          <button onClick={() => onSave(user.id, name, phone)}>💾 Save</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Garage Modal ─────────────────────────────────────────────────────────
function EditGarageModal({ garage, onSave, onClose }) {
  const [form, setForm] = useState({ garage_name: garage.garage_name, phone: garage.phone, district: garage.district, address: garage.address || '' })
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}))
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-box" style={{maxWidth:440}}>
        <div className="modal-header"><h3>✏️ Edit Garage</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <label className="auth-field">Garage Name <input value={form.garage_name} onChange={set('garage_name')} /></label>
        <label className="auth-field">Phone <input value={form.phone} onChange={set('phone')} /></label>
        <label className="auth-field">District <input value={form.district} onChange={set('district')} /></label>
        <label className="auth-field">Address <input value={form.address} onChange={set('address')} /></label>
        <div className="modal-actions">
          <button onClick={() => onSave(garage.id, form)}>💾 Save</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ item, onSave, onClose }) {
  const [pwd, setPwd]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr]     = useState('')
  function handleSave() {
    if (pwd.length < 6) { setErr('Min 6 characters'); return }
    if (pwd !== confirm) { setErr('Passwords do not match'); return }
    onSave(item.id, item.type, pwd)
  }
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-box" style={{maxWidth:380}}>
        <div className="modal-header"><h3>🔑 Reset Password</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <p style={{color:'#4a5d73',fontSize:'0.9rem',margin:'0 0 14px'}}>Reset password for <strong>{item.name}</strong></p>
        <label className="auth-field">New Password <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="Min 6 characters" /></label>
        <label className="auth-field">Confirm <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat password" /></label>
        {err && <p className="auth-error">{err}</p>}
        <div className="modal-actions">
          <button onClick={handleSave}>🔑 Reset</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ item, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal-box" style={{maxWidth:380}}>
        <div className="modal-header"><h3>🗑️ Confirm Delete</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <p style={{color:'#4a5d73'}}>Are you sure you want to delete <strong>{item.name}</strong>? This cannot be undone.</p>
        <div className="modal-actions">
          <button style={{background:'#e74c3c'}} onClick={onConfirm}>🗑️ Delete</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Stats Section ─────────────────────────────────────────────────────────────
function StatsSection({ stats: s }) {
  const cards = [
    { value: s.requests.total,                 label: 'Total Requests',    color: '#1f4fd6' },
    { value: s.requests.completed,             label: 'Completed',         color: '#27ae60' },
    { value: s.requests.pending,               label: 'Pending',           color: '#e67e22' },
    { value: s.requests.completion_rate + '%', label: 'Completion Rate',   color: '#2980b9' },
    { value: s.users.total_registered,         label: 'Registered Users',  color: '#8e44ad' },
    { value: s.garages.in_csv,                 label: 'Garages in System', color: '#16a085' },
    { value: s.garages.verified,               label: 'Verified Garages',  color: '#27ae60' },
    { value: s.ratings.average ? s.ratings.average + ' ★' : 'N/A', label: 'Avg Rating', color: '#f39c12' },
  ]
  const maxReq  = s.top_garages[0]?.requests || 1
  const maxProb = s.top_problems[0]?.count   || 1
  const maxDist = Math.max(...Object.values(s.busiest_districts || {}), 1)
  const urgencyColors = { emergency:'#e74c3c', urgent:'#e67e22', normal:'#27ae60' }

  return (
    <div>
      <h2 style={{marginBottom:14}}>📊 System Statistics</h2>
      <div className="stats-grid">
        {cards.map(c => (
          <div key={c.label} className="stat-card">
            <div className="stat-value" style={{color:c.color}}>{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="stats-tables">
        <div className="stat-table">
          <h4>🏆 Most Requested Garages</h4>
          {s.top_garages.map(g => (
            <div key={g.name} className="stat-row">
              <span style={{flex:2,fontWeight:600,fontSize:'0.82rem'}}>{g.name}</span>
              <div className="stat-bar-wrap"><div className="stat-bar" style={{width:`${g.requests/maxReq*100}%`}} /></div>
              <span style={{minWidth:24,textAlign:'right'}}>{g.requests}</span>
              {g.avg_rating && <span style={{marginLeft:6,color:'#f39c12',fontSize:'0.82rem'}}>{g.avg_rating}★</span>}
            </div>
          ))}
        </div>
        <div className="stat-table">
          <h4>🔧 Top Car Problems</h4>
          {s.top_problems.map(p => (
            <div key={p.type} className="stat-row">
              <span style={{flex:2,fontSize:'0.82rem'}}>{p.type}</span>
              <div className="stat-bar-wrap"><div className="stat-bar" style={{width:`${p.count/maxProb*100}%`,background:'#16a085'}} /></div>
              <span style={{minWidth:24,textAlign:'right'}}>{p.count}</span>
            </div>
          ))}
          <h4 style={{margin:'14px 0 10px'}}>⚡ Urgency</h4>
          {s.urgency.map(u => (
            <div key={u.level} className="stat-row">
              <span style={{flex:2,textTransform:'capitalize',color:urgencyColors[u.level],fontWeight:700}}>{u.level}</span>
              <span>{u.count} requests</span>
            </div>
          ))}
        </div>
        <div className="stat-table">
          <h4>📍 Garages by District</h4>
          {Object.entries(s.busiest_districts).map(([d,c]) => (
            <div key={d} className="stat-row">
              <span style={{flex:2,fontSize:'0.82rem'}}>{d}</span>
              <div className="stat-bar-wrap"><div className="stat-bar" style={{width:`${c/maxDist*100}%`,background:'#8e44ad'}} /></div>
              <span style={{minWidth:24,textAlign:'right'}}>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
