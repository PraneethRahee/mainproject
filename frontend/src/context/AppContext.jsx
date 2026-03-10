import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiRequest } from '../lib/session.js'
import { getAccessToken, clearSession } from '../lib/session.js'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userLoading, setUserLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null)
      setUserLoading(false)
      return
    }
    setUserLoading(true)
    try {
      const res = await apiRequest('/users/me')
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setUser(data)
      } else {
        if (res.status === 401) clearSession()
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
  }, [])

  const value = {
    user,
    setUser,
    userLoading,
    refreshUser,
    logout,
    role: user?.role ?? null,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
