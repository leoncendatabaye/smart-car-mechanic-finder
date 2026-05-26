import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('smf_user')) } catch { return null }
  })

  function login(token, userData) {
    localStorage.setItem('smf_token', token)
    localStorage.setItem('smf_user', JSON.stringify(userData))
    setUser(userData)
  }

  function logout() {
    localStorage.removeItem('smf_token')
    localStorage.removeItem('smf_user')
    setUser(null)
  }

  // Validate token role
  function isValidUserToken() {
    const token = localStorage.getItem('smf_token')
    if (!token) return false
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.role === 'user'
    } catch { return false }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isValidUserToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
