import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { has, isAdmin, role, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <span data-testid="role">{role}</span>
      <span data-testid="admin">{String(isAdmin)}</span>
      <span data-testid="anime">{String(has("media_type.anime"))}</span>
      <span data-testid="manga">{String(has("media_type.manga"))}</span>
      <span data-testid="invented">{String(has("label.invented"))}</span>
      <span data-testid="selflist">{String(has("self.list"))}</span>
    </div>
  );
}

function mockMe(body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  delete global.fetch;
});

describe("useAuth().has", () => {
  it("answers true only for permissions the viewer holds", async () => {
    mockMe({
      is_admin: false,
      username: "friend",
      role: "friend",
      is_root: false,
      permissions: ["media_type.anime"],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("anime")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("manga")).toHaveTextContent("false");
    expect(screen.getByTestId("role")).toHaveTextContent("friend");
  });

  it("gives a root role every permission, including ones nobody granted", async () => {
    // The reason a new content label never hides content from an admin.
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: [],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("invented")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("manga")).toHaveTextContent("true");
  });

  it("does not hand a root role the self family", async () => {
    // The one exception to the short-circuit above, and it mirrors
    // Viewer.has on the server: self.* is ownership, not privilege. An admin
    // account administers the site and keeps no library on it, so the nav
    // must not advertise Plan, Seasonal and Statistics to a caller the API
    // answers 401.
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: [],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("selflist")).toHaveTextContent("false"),
    );
    // The mirror on the same viewer: everything else still short-circuits,
    // so a false above is the carve-out and not a broken root flag.
    expect(screen.getByTestId("invented")).toHaveTextContent("true");
  });

  it("gives a root role the self family when it is granted explicitly", async () => {
    // Nothing about the carve-out stops a grant. It removes the IMPLICIT
    // hold, so an account that really is granted self.list keeps its library
    // whatever its role's root flag says.
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: ["self.list"],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("selflist")).toHaveTextContent("true"),
    );
  });

  it("falls back to an anonymous guest when /me fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("role")).toHaveTextContent("guest"),
    );
    expect(screen.getByTestId("admin")).toHaveTextContent("false");
    expect(screen.getByTestId("anime")).toHaveTextContent("false");
  });

  it("keeps isAdmin working for the components that still read it", async () => {
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_root: true,
      permissions: [],
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("admin")).toHaveTextContent("true"),
    );
  });
});
