// Frontend: authentication context shared across the app.
//
// /api/auth/me is where the SPA learns what it may show. It carries the whole
// permission set, not just the admin flag, because a viewer can now hold some
// permissions and not others.
//
// `isAdmin` keeps its old meaning and shape: every existing consumer reads it
// to enable or hide a control, and none of them should have to change.
//
// Hiding here is cosmetic. The server already withholds what a viewer may not
// see, so this only stops the UI drawing empty frames around nothing.
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

const AuthContext = createContext(null);

const ANONYMOUS = {
  isAdmin: false,
  username: null,
  role: "guest",
  isSuperuser: false,
  permissions: [],
  loading: false,
};

export function AuthProvider({ children }) {
  // Store the current auth snapshot once so any component can read it.
  const [auth, setAuth] = useState({ ...ANONYMOUS, loading: true });

  // Ask the backend who the current user is. This runs on app startup and on demand.
  const fetchAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAuth({
          isAdmin: data.is_admin,
          username: data.username,
          role: data.role ?? "guest",
          isSuperuser: data.is_superuser ?? false,
          permissions: data.permissions ?? [],
          loading: false,
        });
      } else {
        setAuth({ ...ANONYMOUS });
      }
    } catch {
      setAuth({ ...ANONYMOUS });
    }
  }, []);

  useEffect(() => {
    // Populate auth state as soon as the provider mounts.
    fetchAuth();
  }, [fetchAuth]);

  // A Set so has() stays O(1) on pages that ask about many permissions.
  const held = useMemo(() => new Set(auth.permissions), [auth.permissions]);

  // Mirrors Viewer.has on the server, superuser short-circuit included, so a
  // new content label or field group does not have to be granted to the admin.
  const has = useCallback(
    (permission) => auth.isSuperuser || held.has(permission),
    [auth.isSuperuser, held],
  );

  const value = useMemo(
    () => ({ ...auth, has, refetchAuth: fetchAuth }),
    [auth, has, fetchAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  // Convenience hook so components do not import useContext directly.
  return useContext(AuthContext);
}
