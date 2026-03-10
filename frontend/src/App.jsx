import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Mfa from './pages/Mfa.jsx'
import Chat from './pages/Chat.jsx'
import AdminAuditLogs from './pages/AdminAuditLogs.jsx'
import { AdminRoute } from './components/AdminRoute.jsx'
import { useApp } from './context/AppContext.jsx'

function App() {
  const { user } = useApp()

  return (
    <div className="app-shell">
      <nav className="nav-placeholder">
        <NavLink to="/login">Login</NavLink>
        <NavLink to="/register">Register</NavLink>
        <NavLink to="/mfa">MFA</NavLink>
        <NavLink to="/chat">Chat</NavLink>
        {user?.role === 'admin' && (
          <NavLink to="/admin/audit-logs">Audit Logs</NavLink>
        )}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<NavigateToLogin />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/mfa" element={<Mfa />} />
          <Route path="/chat" element={<Chat />} />
          <Route
            path="/admin/audit-logs"
            element={
              <AdminRoute>
                <AdminAuditLogs />
              </AdminRoute>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

function NavigateToLogin() {
  return <Navigate to="/login" replace />
}

export default App
