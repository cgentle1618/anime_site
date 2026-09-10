// The one thing a signed-in member can change about their own account.
//
// What matters here is that the toggle reflects the server and writes back to
// it - a switch that only moved locally would tell someone their list was
// public when it was not.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../hooks/useToast";
import Settings from "./Settings";

const PRIVATE = { username: "kana", role_name: "user", list_is_public: false };

// ToastProvider, as every other page test in this tree does it: useToast reads
// a context and returns null outside the provider.
function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Settings />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("Settings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        if (options.method === "PATCH") {
          const body = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({ ...PRIVATE, ...body }),
          };
        }
        return { ok: true, status: 200, json: async () => PRIVATE };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the account it is about", async () => {
    renderPage();
    expect(await screen.findByText("kana")).toBeInTheDocument();
  });

  it("starts on the value the server reported", async () => {
    renderPage();
    const toggle = await screen.findByRole("checkbox", {
      name: /make my list public/i,
    });
    expect(toggle).not.toBeChecked();
  });

  it("writes the new value back", async () => {
    renderPage();
    const toggle = await screen.findByRole("checkbox", {
      name: /make my list public/i,
    });
    await userEvent.click(toggle);

    await waitFor(() => {
      const patch = global.fetch.mock.calls.find(
        ([, opts]) => opts?.method === "PATCH",
      );
      expect(patch).toBeTruthy();
      expect(patch[0]).toBe("/api/account/settings");
      expect(JSON.parse(patch[1].body)).toEqual({ list_is_public: true });
    });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("says where a public list becomes visible", async () => {
    renderPage();
    expect(await screen.findByText(/\/user\/kana/)).toBeInTheDocument();
  });
});
