// Frontend: layout component file for ProtectedRoute.
//
// Guards a route on one permission. It defaults to "admin", a permission no
// role holds any more (Phase A split it into admin.authz, manage.catalog and
// manage.pipelines) - a bare <Route element={<ProtectedRoute />}> now denies
// everyone but a root role (is_root short-circuits every check), not
// "everyone who used to pass". Every call site below passes requireAuth or an
// explicit permission, so nothing currently relies on the default; a new bare
// use should pick the permission it actually needs rather than lean on this.
//
// `requireAuth` asks the weaker question instead - "is anyone logged in?" -
// mirroring the server's get_current_user_id. The per-user pages (Plan,
// Seasonal, Statistics) need an account, not a role.
//
// This is a redirect, not a security boundary: the API refuses the request on
// its own. The point is to send someone to the login page instead of showing
// them a screen that will only fill with errors.
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function ProtectedRoute({
  permission = "admin",
  requireAuth = false,
}) {
  const { has, username, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-text-faint font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // requireAuth gates on "is anyone logged in" rather than on a permission.
  const allowed = requireAuth ? Boolean(username) : has(permission);

  // Without it, send them to login and preserve the page they wanted.
  return allowed ? (
    <Outlet />
  ) : (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
}
