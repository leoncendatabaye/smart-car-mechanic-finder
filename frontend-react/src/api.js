const BASE = '/api'

function authHeaders(extra = {}) {
  const token = localStorage.getItem('smf_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export const api = {
  // Auth
  userRegister: (body) => request('POST', '/auth/user/register', body),
  userLogin:    (body) => request('POST', '/auth/user/login', body),
  garageLogin:  (body) => request('POST', '/auth/garage/login', body),
  garageRegister: (body) => request('POST', '/auth/garage/register', body),

  // Recommendations
  recommend: (body) => request('POST', '/recommend', body),

  // Garages list for registration
  garagesList: () => request('GET', '/garages/list'),
  garageLocation: (name) => request('GET', `/garage/location?name=${encodeURIComponent(name)}`),
  garageSpecialities: () => request('GET', '/garages/specialities'),

  // Requests
  sendRequest:   (body) => request('POST', '/request', body),
  getRequest:    (id)   => request('GET', `/request/${id}`),
  updateStatus:  (id, status) => request('PATCH', `/request/${id}/status`, { status }),
  rateRequest:   (id, body)   => request('POST', `/request/${id}/rate`, body),
  getUserRequests: ()  => request('GET', '/user/requests'),

  // Garage dashboard
  garageRequests: (name) => request('GET', `/garage/${encodeURIComponent(name)}/requests`),

  // Admin
  adminGarages: (key) =>
    fetch(`${BASE}/admin/garages`, { headers: { 'X-Admin-Key': key } }).then(r => r.json()),
  adminStats: (key) =>
    fetch(`${BASE}/admin/stats`, { headers: { 'X-Admin-Key': key } }).then(r => r.json()),
  adminSetStatus: (key, id, status) =>
    fetch(`${BASE}/admin/garage/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
      body: JSON.stringify({ status }),
    }).then(r => r.json()),
}
