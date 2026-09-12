// Frontend: authentication context shared across the app.
//
// /api/auth/me is where the SPA learns what it may show. It carries the whole
// permission set, not just the admin flag, because a viewer can now hold some
// permissions and not others.
//
// `isAdmin` keeps its old shape (a boolean every existing consumer reads to
// enable or hide a control) but not its old meaning: it now reports whether
// the viewer holds manage.catalog, not the deleted bare admin permission.
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
  // The OBJECT axis. `mode` is the active access mode; `modes` is every mode
  // this account holds, each already carrying `requires_password` - the
  // server computes that subset test so the SPA never models it. A guest
  // holds none.
  mode: null,
  modes: [],
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
          mode: data.mode ?? null,
          modes: data.modes ?? [],
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
  //
  // The one exception mirrors the server's: the short-circuit does NOT cover
  // the `self` family. self.list and self.personal_notes are ownership, not
  // privilege - an admin account administers the site and does not keep a
  // library of its own. Both halves move together or neither does: with only
  // the server half, the nav would advertise Plan, Seasonal and Statistics to
  // an admin and the API would answer 401 on each.
  const has = useCallback(
    (permission) =>
      permission.startsWith("self.")
        ? held.has(permission)
        : auth.isSuperuser || held.has(permission),
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
