import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Users from "./Users";

/**
 * The Access column's "Change" button opens the per-account mode panel.
 *
 * It is worth a test because the failure mode here is SILENT: the button sets
 * a piece of state, and if nothing reads that state the click does nothing at
 * all - no error, no toast, no console warning. That is exactly how the panel
 * shipped in 384bbdd4 and stayed dead; eslint said "assigned a value but
 * never used" three times and said it as a WARNING, which CI does not fail
 * on. A rendering assertion is the only thing that notices.
 */

const USERS = [
  {
    id: 1,
    username: "alice",
    role_id: "admin",
    access_modes: [
      {
        mode_id: "wide",
        is_default: true,
        denied_label_keys: [],
        denied_field_group_keys: [],
      },
    ],
  },
];

const ROLES = [{ system_id: "admin", label: "Admin" }];

const MODES = [
  {
    system_id: "wide",
    label: "Wide",
    label_keys: ["nsfw"],
    field_group_keys: [],
  },
  { system_id: "narrow", label: "Narrow", label_keys: [], field_group_keys: [] },
];

const showToast = vi.fn();
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast }),
}));

const fetchJson = vi.fn();
vi.mock("../../api/client", () => ({
  fetchJson: (...args) => fetchJson(...args),
  jsonBody: (body) => ({ body: JSON.stringify(body) }),
}));

beforeEach(() => {
  showToast.mockReset();
  fetchJson.mockReset();
  fetchJson.mockImplementation((url) => {
    if (url.includes("/roles")) return Promise.resolve(ROLES);
    if (url.includes("/access-modes")) return Promise.resolve(MODES);
    return Promise.resolve(USERS);
  });
});

describe("the access-mode panel", () => {
  it("opens when Change is clicked", async () => {
    // THE LOAD-BEARING CASE. Everything else on this page can be right while
    // the panel is unreachable, because an unmounted component breaks nothing
    // it does not render.
    render(<Users />);
    await screen.findByText("alice");

    await userEvent.click(screen.getByRole("button", { name: "Change" }));

    expect(await screen.findByText("Access for alice")).toBeTruthy();
  });

  it("offers every mode, not only the ones the account holds", async () => {
    // The panel's whole job is granting a mode the account does not have yet,
    // so a panel listing only held modes would open and still be useless.
    render(<Users />);
    await screen.findByText("alice");
    await userEvent.click(screen.getByRole("button", { name: "Change" }));

    await screen.findByText("Access for alice");
    expect(screen.getByText("Wide")).toBeTruthy();
    expect(screen.getByText("Narrow")).toBeTruthy();
  });

  it("saves the held modes to the account's access-modes endpoint", async () => {
    render(<Users />);
    await screen.findByText("alice");
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByText("Access for alice");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        fetchJson.mock.calls.some(
          ([url, opts]) =>
            url === "/api/users/1/access-modes" && opts?.method === "PUT",
        ),
      ).toBe(true),
    );
  });

  it("closes without saving when Close is clicked", async () => {
    render(<Users />);
    await screen.findByText("alice");
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByText("Access for alice");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByText("Access for alice")).toBeNull(),
    );
    expect(
      fetchJson.mock.calls.some(([, opts]) => opts?.method === "PUT"),
    ).toBe(false);
  });
});
