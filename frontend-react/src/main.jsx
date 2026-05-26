import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoadScript } from '@react-google-maps/api'
import { AuthProvider, useAuth } from './AuthContext'
import { LanguageProvider } from './LanguageContext'

import Login           from './pages/Login'
import Register        from './pages/Register'
import Home            from './pages/Home'
import GarageLogin     from './pages/GarageLogin'
import GarageRegister  from './pages/GarageRegister'
import GarageDashboard from './pages/GarageDashboard'
import AdminPanel      from './pages/AdminPanel'
import MyRequests      from './pages/MyRequests'

import './index.css'

const MAPS_KEY  = 'AIzaSyAA6hn9QRmdkDn7YZ4G8Zs_8tyiuQIZWIQ'
const LIBRARIES = ['places']

function ProtectedRoute({ children }) {
  const { isValidUserToken } = useAuth()
  return isValidUserToken() ? children : <Navigate to="/login" replace />
}
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <LanguageProvider>
      <LoadScript googleMapsApiKey={MAPS_KEY} libraries={LIBRARIES}
        loadingElement={<></>}>
        <BrowserRouter>
          <Routes>
            <Route path="/login"            element={<Login />} />
            <Route path="/register"         element={<Register />} />
            <Route path="/garage"           element={<GarageLogin />} />
            <Route path="/garage/register"  element={<GarageRegister />} />
            <Route path="/garage/dashboard" element={<GarageDashboard />} />
            <Route path="/admin"            element={<AdminPanel />} />
            <Route path="/home"             element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/my-requests"      element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
            <Route path="/"                 element={<Navigate to="/login" replace />} />
            <Route path="*"                 element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </LoadScript>
      </LanguageProvider>
    </AuthProvider>
  </React.StrictMode>
)
