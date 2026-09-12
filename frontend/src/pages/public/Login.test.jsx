// Login sends the visitor to ?next= after a successful sign-in. It already
// refuses a next that does not start with "/" (an absolute URL would be an
// open redirect). It must also refuse one that points back at /login: such a
// next lands an authenticated visitor on the login form again, with the page
// they actually wanted buried one level further down, and Login has no
// already-signed-in bounce to rescue them from it.
//
// It reaches that destination with a FULL PAGE LOAD, not a client-side
// navigate: everything the SPA cached a moment ago it cached as a guest.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Login from "./Login";

const { hardNavigate } = vi.hoisted(() => ({ hardNavigate: vi.fn() }));
vi.mock("../../lib/hardNavigate", () => ({ hardNavigate }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ refetchAuth: vi.fn() }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

beforeEach(() => {
  hardNavigate.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function signIn(route) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Login />
    </MemoryRouter>,
  );
  await userEvent.type(screen.getByLabelText(/username/i), "someone");
  await userEvent.type(screen.getByLabelText(/password/i), "a-test-value");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("Login - where ?next= is allowed to send you", () => {
  it("honours a next naming a real page", async () => {
    await signIn("/login?next=%2Fstatistics");
    expect(hardNavigate).toHaveBeenCalledWith("/statistics");
  });

  it("refuses a next pointing back at /login", async () => {
    await signIn("/login?next=%2Flogin%3Fnext%3D%252Fstatistics");
    expect(hardNavigate).toHaveBeenCalledWith("/system");
  });

  it("refuses a bare /login next", async () => {
    await signIn("/login?next=%2Flogin");
    expect(hardNavigate).toHaveBeenCalledWith("/system");
  });

  it("still refuses an absolute URL", async () => {
    await signIn("/login?next=https%3A%2F%2Felsewhere.example%2Fx");
    expect(hardNavigate).toHaveBeenCalledWith("/system");
  });
});
