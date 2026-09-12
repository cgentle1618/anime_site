// Frontend: page component file for Login.
import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { hardNavigate } from "../../lib/hardNavigate";
import { useToast } from "../../hooks/useToast";
import { Button, Eyebrow, Slip } from "../../components/ui/primitives";
import { forgetUser, readSavedUsers, rememberUser } from "../../lib/savedUsers";

const INPUT_CLS =
  "w-full px-3 py-2 border border-border-strong bg-surface text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Usernames saved on this browser, most recently used first. Read once:
  // nothing outside this page writes the list while it is open.
  const [savedUsers, setSavedUsers] = useState(readSavedUsers);
  const [username, setUsername] = useState("");
  const passwordRef = useRef(null);
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
        // Only a sign-in that worked earns a slot, so a typo never spends one.
        rememberUser(formData.get("username"));
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

  function pickUser(name) {
    setUsername(name);
    // The password is then the only thing missing; leave nothing to do but type.
    passwordRef.current?.focus();
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <Slip title="User" className="w-full max-w-md" bodyClassName="p-8">
        <header className="mb-8">
          <h1 className="font-display text-4xl font-semibold text-text leading-none">
            Sign in
          </h1>
        </header>

        {error && (
          <div
            role="alert"
            className="border border-danger text-danger px-3 py-2 mb-6 text-sm"
          >
            {error}
          </div>
        )}

        {savedUsers.length > 0 && (
          <div className="mb-6">
            <Eyebrow className="block mb-1.5">Saved users</Eyebrow>
            <ul className="flex flex-wrap gap-2">
              {savedUsers.map((name) => (
                <li
                  key={name}
                  className="flex items-stretch border border-border-strong bg-surface-2 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => pickUser(name)}
                    className="px-3 py-1.5 text-text hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-brand transition"
                  >
                    {/* "Use", not "Sign in as": clicking fills the form, it
                        does not authenticate - the password is still needed. */}
                    <span className="sr-only">Use </span>
                    {name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => setSavedUsers(forgetUser(name))}
                    className="px-2 border-l border-border-strong text-text-faint hover:bg-surface-3 hover:text-danger focus:outline-none focus:ring-2 focus:ring-brand transition"
                  >
                    <i className="fas fa-times" aria-hidden="true"></i>
                  </button>
                </li>
              ))}
            </ul>
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={INPUT_CLS}
              placeholder="user123"
            />
          </div>

          <div>
            <Eyebrow as="label" htmlFor="login-password" className="block mb-1.5">
              Password
            </Eyebrow>
            <input
              id="login-password"
              ref={passwordRef}
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
