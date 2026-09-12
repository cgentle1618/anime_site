// Frontend: the boxes a role cannot change are drawn disabled.
//
// Which ones is served per role as locked_on / locked_off, from the same
// table PUT /api/roles/{id}/permissions enforces with a 409
// (app/services/rbac/permissions.py::locked_permissions) - so this page is
// the first of two stops rather than the only one. What it adds is that the
// invalid save cannot be asked for.
//
// Rendered rather than asserted through a pure helper: the thing that can be
// wrong here is an enabled checkbox, not a predicate.
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EVERY = [
  "admin.authz",
  "manage.catalog",
  "manage.pipelines",
  "media_type.anime",
  "self.list",
];

const ROLES = [
  {
    system_id: "u",
    name: "user",
    label: "User",
    description: "A signed-in member.",
    is_system: true,
    is_root: false,
    permissions: ["media_type.anime", "self.list"],
    user_count: 1,
    locked_on: [],
    locked_off: ["admin.authz", "manage.pipelines"],
  },
  {
    system_id: "s",
    name: "super",
    label: "Super",
    description: "Everything but authorization.",
    is_system: true,
    is_root: false,
    permissions: EVERY.filter((p) => p !== "admin.authz"),
    user_count: 0,
    locked_on: EVERY.filter((p) => p !== "admin.authz"),
    locked_off: ["admin.authz"],
  },
  {
    system_id: "a",
    name: "admin",
    label: "Admin",
    description: "Full access.",
    is_system: true,
    is_root: true,
    permissions: [],
    user_count: 1,
    locked_on: EVERY.filter((p) => !p.startsWith("self.")),
    locked_off: ["self.list"],
  },
];

const CATALOG = [
  {
    family: "admin",
    label: "Administration",
    permissions: [
      { permission: "admin.authz", label: "Manage Authorization", description: null },
    ],
  },
  {
    family: "manage",
    label: "Management",
    permissions: [
      { permission: "manage.catalog", label: "Manage Catalogue", description: null },
      { permission: "manage.pipelines", label: "Run Pipelines", description: null },
    ],
  },
  {
    family: "media_type",
    label: "Media Types",
    permissions: [
      { permission: "media_type.anime", label: "Anime", description: null },
    ],
  },
  {
    family: "self",
    label: "Own Rows",
    permissions: [{ permission: "self.list", label: "Own List", description: null }],
  },
];

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: () => {} }),
}));

vi.mock("../../api/client", () => ({
  fetchJson: vi.fn((url) =>
    Promise.resolve(String(url).includes("catalog") ? CATALOG : ROLES),
  ),
  jsonBody: (body) => ({ body }),
}));

const { default: Roles } = await import("./Roles");

async function selectRole(label) {
  render(<Roles />);
  // getAll, not get: the page auto-selects the first role, so that one's name
  // is on screen twice - once in the list, once as the editor's heading.
  await screen.findAllByText(label);
  screen.getAllByText(label)[0].click();
}

function boxFor(name) {
  const label = screen.getByText(name).closest("label");
  return label.querySelector('input[type="checkbox"]');
}

describe("the Super role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("draws every box disabled - nothing about it is a choice", async () => {
    await selectRole("Super");
    await waitFor(() => {
      const boxes = screen.getAllByRole("checkbox");
      expect(boxes.length).toBe(EVERY.length);
      expect(boxes.every((b) => b.disabled)).toBe(true);
    });
  });

  it("shows authorization clear and everything else ticked", async () => {
    await selectRole("Super");
    await waitFor(() => {
      expect(boxFor("Manage Authorization").checked).toBe(false);
      expect(boxFor("Run Pipelines").checked).toBe(true);
      expect(boxFor("Manage Catalogue").checked).toBe(true);
    });
  });

  it("offers no Save button", async () => {
    await selectRole("Super");
    await waitFor(() => expect(screen.queryByText("Save")).toBeNull());
  });
});

describe("the Admin role", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows every management point ticked and unchangeable", async () => {
    await selectRole("Admin");
    await waitFor(() => {
      for (const name of [
        "Manage Authorization",
        "Manage Catalogue",
        "Run Pipelines",
      ]) {
        expect(boxFor(name).checked).toBe(true);
        expect(boxFor(name).disabled).toBe(true);
      }
    });
  });

  it("shows Own Rows clear, because an admin account holds none", async () => {
    // Viewer.has() does not short-circuit the self family, so a ticked box
    // here would state the opposite of what the resolver does.
    await selectRole("Admin");
    await waitFor(() => {
      expect(boxFor("Own List").checked).toBe(false);
      expect(boxFor("Own List").disabled).toBe(true);
    });
  });
});

describe("the User role", () => {
  beforeEach(() => vi.clearAllMocks());

  // The mirror, same page and same fixtures: a green above proves the locks
  // did the disabling rather than every box on this page being disabled.
  it("lets the catalogue and own-rows boxes be changed", async () => {
    await selectRole("User");
    await waitFor(() => {
      expect(boxFor("Manage Catalogue").disabled).toBe(false);
      expect(boxFor("Own List").disabled).toBe(false);
      expect(boxFor("Anime").disabled).toBe(false);
    });
  });

  it("still refuses authorization and the pipelines", async () => {
    await selectRole("User");
    await waitFor(() => {
      expect(boxFor("Manage Authorization").disabled).toBe(true);
      expect(boxFor("Manage Authorization").checked).toBe(false);
      expect(boxFor("Run Pipelines").disabled).toBe(true);
    });
  });

  it("offers a Save button, since something is editable", async () => {
    await selectRole("User");
    await waitFor(() => expect(screen.queryByText("Save")).not.toBeNull());
  });
});
