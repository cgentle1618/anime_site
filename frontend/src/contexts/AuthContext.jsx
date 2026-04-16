import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ isAdmin: false, username: null, loading: true })

  const fetchAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setAuth({ isAdmin: data.is_admin, username: data.username, loading: false })
      } else {
        setAuth({ isAdmin: false, username: null, loading: false })
      }
    } catch {
      setAuth({ isAdmin: false, username: null, loading: false })
    }
  }, [])

  useEffect(() => {
    fetchAuth()
  }, [fetchAuth])

  return (
    <AuthContext.Provider value={{ ...auth, refetchAuth: fetchAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
