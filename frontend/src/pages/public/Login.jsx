// Frontend: page component file for Login.
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { hardNavigate } from "../../lib/hardNavigate";
import { useToast } from "../../hooks/useToast";
import { Button, Eyebrow, Slip } from "../../components/ui/primitives";

const INPUT_CLS =
  "w-full px-3 py-2 border border-border-strong bg-surface text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { showToast } = useToast();
  const location = useLocation();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new URLSearchParams(new FormData(e.target));

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
        credentials: "include",
      });

      if (res.ok) {
        const params = new URLSearchParams(location.search);
        const next = params.get("next");
        // Must start with "/" (an absolute URL would be an open redirect) and
        // must not point back at /login - that lands a signed-in visitor on
        // this form again with their real destination buried a level deeper.
        // The negative lookahead keeps a genuine page like /loginary usable.
        const usable =
          next && next.startsWith("/") && !/^\/login(?![\w-])/.test(next);
        // A FULL page load, not a client-side navigate. Everything the SPA
        // cached up to this moment it cached as a guest, and the destination
        // would be drawn from that cache.
        hardNavigate(usable ? next : "/system");
      } else {
        const data = await res.json();
        setError(data.detail || "Authentication failed.");
        showToast("error", data.detail || "Authentication failed.");
      }
    } catch {
      setError("Network error. Please check your connection.");
      showToast("error", "Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <Slip title="Admin" className="w-full max-w-md" bodyClassName="p-8">
        <header className="mb-8">
          <Eyebrow className="mb-2">Sign in</Eyebrow>
          <h1 className="font-display text-4xl font-semibold text-text leading-none mb-2">
            Admin access
          </h1>
          <p className="text-sm text-text-muted">Sign in to manage the collection.</p>
        </header>

        {error && (
          <div
            role="alert"
            className="border border-danger text-danger px-3 py-2 mb-6 text-sm"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Eyebrow as="label" htmlFor="login-username" className="block mb-1.5">
              Username
            </Eyebrow>
            <input
              id="login-username"
              type="text"
              name="username"
              required
              className={INPUT_CLS}
              placeholder="admin"
            />
          </div>

          <div>
            <Eyebrow as="label" htmlFor="login-password" className="block mb-1.5">
              Password
            </Eyebrow>
            <input
              id="login-password"
              type="password"
              name="password"
              required
              className={INPUT_CLS}
              placeholder="••••••••"
            />
          </div>

          <Button kind="primary" type="submit" disabled={loading} className="w-full py-2.5">
            {loading ? (
              <>
                <i className="fas fa-circle-notch fa-spin"></i> Verifying…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </Slip>
    </div>
  );
}
