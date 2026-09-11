// Frontend: test for the route guard.
//
// Plan, Seasonal and Statistics are per-user pages from Step 3 on and their
// APIs answer 401 to a stranger. The guard is what turns that into a login
// redirect instead of a screen full of errors.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ProtectedRoute from "./ProtectedRoute";

const mockAuth = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuth(),
}));

function renderAt(path, auth) {
  mockAuth.mockReturnValue(auth);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute requireAuth />}>
          <Route path="/plan" element={<div>the plan page</div>} />
        </Route>
        <Route path="/login" element={<div>the login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute requireAuth", () => {
  it("sends a logged-out visitor to login", () => {
    renderAt("/plan", { username: null, has: () => false, loading: false });
    expect(screen.getByText("the login page")).toBeInTheDocument();
  });

  it("lets a logged-in non-admin through", () => {
    renderAt("/plan", { username: "kana", has: () => false, loading: false });
    expect(screen.getByText("the plan page")).toBeInTheDocument();
  });

  it("gates on the permission prop when requireAuth is absent, both directions", () => {
    function renderPipelines(has) {
      mockAuth.mockReturnValue({ username: "kana", has, loading: false });
      return render(
        <MemoryRouter initialEntries={["/system"]}>
          <Routes>
            <Route element={<ProtectedRoute permission="manage.pipelines" />}>
              <Route path="/system" element={<div>the pipelines page</div>} />
            </Route>
            <Route path="/login" element={<div>the login page</div>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    // Denied: a viewer who does not hold manage.pipelines is bounced to login,
    // even though they hold some other, unrelated permission.
    const { unmount } = renderPipelines((p) => p === "manage.catalog");
    expect(screen.getByText("the login page")).toBeInTheDocument();
    unmount();

    // Allowed: a viewer who holds manage.pipelines reaches the route.
    renderPipelines((p) => p === "manage.pipelines");
    expect(screen.getByText("the pipelines page")).toBeInTheDocument();
  });
});
