import { useEffect, useMemo, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Mfa from './pages/Mfa.jsx'
import Chat from './pages/Chat.jsx'
import Welcome from './pages/Welcome.jsx'
import Landing from './pages/Landing.jsx'
import AdminAuditLogs from './pages/AdminAuditLogs.jsx'
import GroupInviteJoin from './pages/GroupInviteJoin.jsx'
import GroupJoinRequest from './pages/GroupJoinRequest.jsx'
import LinkedDevices from './pages/LinkedDevices.jsx'
import { AdminRoute } from './components/AdminRoute.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { GuestRoute } from './components/GuestRoute.jsx'
import { AuthFlowLoading } from './components/AuthFlowLoading.jsx'
import { useApp } from './context/AppContext.jsx'

/** Logged-in users skip the public welcome; guests see the animated landing page. */
function HomeGate() {
  const { user, userLoading } = useApp()

  if (userLoading) {
    return <AuthFlowLoading message="Loading…" />
  }

  if (user) {
    return <Navigate to="/chat" replace />
  }

  return <Landing />
}

function App() {
  const { user } = useApp()
  const location = useLocation()
  const path = location.pathname
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('theme')
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setTheme(storedTheme)
      return
    }

    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(systemPrefersDark ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('theme', theme)
  }, [theme])

  const isChatRoute = path === '/chat'
  const isLandingRoute = path === '/'
  const isAuthShell =
    path === '/login' ||
    path === '/register' ||
    path === '/mfa' ||
    path === '/welcome'
  const isAdminRoute = path.startsWith('/admin')
  const isSettingsRoute = path.startsWith('/settings')

  const shellClass = [
    'app-shell',
    isChatRoute ? 'app-shell--gchat' : '',
    isLandingRoute ? 'app-shell--landing' : '',
    isAuthShell ? 'app-shell--auth' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const themeButtonLabel = useMemo(
    () => (theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'),
    [theme],
  )

  let mainClass
  if (isChatRoute) mainClass = 'main--gchat'
  else if (isLandingRoute) mainClass = 'main--landing'
  else if (isAuthShell) mainClass = 'main--auth'
  else if (isAdminRoute || isSettingsRoute) mainClass = 'main--admin'

  return (
    <div className={shellClass}>
      <button
        type="button"
        className="theme-toggle"
        aria-label={themeButtonLabel}
        title={themeButtonLabel}
        onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      >
        <span aria-hidden>{theme === 'dark' ? '☀' : '🌙'}</span>
      </button>

      {isAdminRoute && (
        <nav className="nav-admin-bar" aria-label="Admin">
          <NavLink to="/" className="nav-admin-brand" aria-label="Chatapp home">
            <span className="nav-admin-brand-mark" aria-hidden>
              <img className="nav-admin-brand-img" src="/vite.svg" alt="" aria-hidden />
            </span>
            <span className="nav-admin-brand-text">Chatapp</span>
          </NavLink>
          <NavLink to="/chat" className="nav-admin-bar-link">
            ← Back to Chat
          </NavLink>
          {user?.role === 'admin' && (
            <span className="nav-admin-bar-title">Audit logs</span>
          )}
        </nav>
      )}

      {isSettingsRoute && (
        <nav className="nav-admin-bar" aria-label="Settings">
          <NavLink to="/" className="nav-admin-brand" aria-label="Chatapp home">
            <span className="nav-admin-brand-mark" aria-hidden>
              <img className="nav-admin-brand-img" src="/vite.svg" alt="" aria-hidden />
            </span>
            <span className="nav-admin-brand-text">Chatapp</span>
          </NavLink>
          <NavLink to="/chat" className="nav-admin-bar-link">
            ← Back to Chat
          </NavLink>
          <span className="nav-admin-bar-title">Linked devices</span>
        </nav>
      )}

      <main className={mainClass}>
        <Routes>
          <Route path="/" element={<HomeGate />} />
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <Register />
              </GuestRoute>
            }
          />
          <Route
            path="/mfa"
            element={
              <GuestRoute>
                <Mfa />
              </GuestRoute>
            }
          />
          <Route
            path="/welcome"
            element={
              <ProtectedRoute>
                <Welcome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <AdminRoute>
                <AdminAuditLogs />
              </AdminRoute>
            }
          />
          <Route
            path="/settings/linked-devices"
            element={
              <ProtectedRoute>
                <LinkedDevices />
              </ProtectedRoute>
            }
          />
          <Route
            path="/group/join/:token"
            element={
              <ProtectedRoute>
                <GroupInviteJoin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/group/join-request/:groupId"
            element={
              <ProtectedRoute>
                <GroupJoinRequest />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

export default App
