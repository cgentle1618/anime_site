// Frontend: layout component file for ProtectedRoute.
//
// Guards a route on one permission. It defaults to "admin", so every existing
// <Route element={<ProtectedRoute />}> keeps behaving exactly as it did.
//
// This is a redirect, not a security boundary: the API refuses the request on
// its own. The point is to send someone to the login page instead of showing
// them a screen that will only fill with errors.
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function ProtectedRoute({ permission = "admin" }) {
  const { has, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Without the permission, send them to login and preserve the page they wanted.
  return has(permission) ? (
    <Outlet />
  ) : (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
}
