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
      is_superuser: false,
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

  it("gives a superuser every permission, including ones nobody granted", async () => {
    // The reason a new content label never hides content from an admin.
    mockMe({
      is_admin: true,
      username: "admin",
      role: "admin",
      is_superuser: true,
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
      is_superuser: true,
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
