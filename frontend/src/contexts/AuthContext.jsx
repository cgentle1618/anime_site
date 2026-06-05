// Frontend: authentication context shared across the app.
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Store the current auth snapshot once so any component can read it.
  const [auth, setAuth] = useState({
    isAdmin: false,
    username: null,
    loading: true,
  });

  // Ask the backend who the current user is. This runs on app startup and on demand.
  const fetchAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAuth({
          isAdmin: data.is_admin,
          username: data.username,
          loading: false,
        });
      } else {
        setAuth({ isAdmin: false, username: null, loading: false });
      }
    } catch {
      setAuth({ isAdmin: false, username: null, loading: false });
    }
  }, []);

  useEffect(() => {
    // Populate auth state as soon as the provider mounts.
    fetchAuth();
  }, [fetchAuth]);

  return (
    <AuthContext.Provider value={{ ...auth, refetchAuth: fetchAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  // Convenience hook so components do not import useContext directly.
  return useContext(AuthContext);
}

