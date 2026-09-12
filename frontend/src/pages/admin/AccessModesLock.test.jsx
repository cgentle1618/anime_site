// Frontend: the Unrestricted mode's grants are not editable.
//
// Its meaning is "every entry and every field", and the server derives its
// sets rather than reading rows (app/services/rbac/cache.py::mode_sets) - so
// a tick box on this mode could only ever lie. PUT /grants answers 409 for
// it, which makes this the first of two stops rather than the only one; what
// the page adds is that the invalid thing cannot be asked for.
//
// Rendered rather than asserted through a pure helper: the thing that can be
// wrong here is an enabled checkbox, not a predicate.
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const MODES = [
  {
    system_id: "wide",
    key: "unrestricted",
    label: "Unrestricted",
    description: "Every entry and every field.",
    is_system: true,
    is_guest_default: false,
    label_keys: ["nsfw"],
    field_group_keys: ["credits"],
  },
  {
    system_id: "narrow",
    key: "normal",
    label: "Normal",
    description: "No labelled entries.",
    is_system: true,
    is_guest_default: false,
    label_keys: [],
    field_group_keys: ["credits"],
  },
];

const CATALOG = [
  {
    group: "label",
    label: "Content Labels",
    items: [{ key: "nsfw", label: "NSFW", description: null, mode_count: 1 }],
  },
  {
    group: "field_group",
    label: "Field Groups",
    items: [
      { key: "credits", label: "Credits", description: null, mode_count: 2 },
    ],
  },
];

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: () => {} }),
}));

vi.mock("../../api/client", () => ({
  fetchJson: vi.fn((url) =>
    Promise.resolve(String(url).includes("catalog") ? CATALOG : MODES),
  ),
  jsonBody: (body) => ({ body }),
}));

const { default: AccessModes } = await import("./AccessModes");

async function selectMode(label) {
  render(<AccessModes />);
  // getAll, not get: the page auto-selects the first mode, so that one's name
  // is on screen twice - once in the list, once as the editor's heading.
  await screen.findAllByText(label);
  const row = screen.getAllByText(label)[0];
  row.click();
  return row;
}

describe("the Unrestricted mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders its item checkboxes disabled", async () => {
    await selectMode("Unrestricted");
    await waitFor(() => {
      const boxes = screen
        .getAllByRole("checkbox")
        .filter((b) => b.type === "checkbox");
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.every((b) => b.disabled)).toBe(true);
    });
  });

  it("offers no Save button", async () => {
    await selectMode("Unrestricted");
    await waitFor(() => {
      expect(screen.queryByText("Save")).toBeNull();
    });
  });

  it("says why it cannot be edited", async () => {
    await selectMode("Unrestricted");
    expect(
      await screen.findByText(/carries every label and every field group/i),
    ).toBeTruthy();
  });
});

describe("every other mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The mirror, same page and same fixtures, so a green above proves the mode
  // did the locking rather than the checkboxes being absent or the Save
  // button never rendering at all.
  it("renders its item checkboxes enabled", async () => {
    await selectMode("Normal");
    await waitFor(() => {
      const boxes = screen
        .getAllByRole("checkbox")
        .filter((b) => b.type === "checkbox");
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.some((b) => b.disabled)).toBe(false);
    });
  });

  it("offers a Save button", async () => {
    await selectMode("Normal");
    expect(await screen.findByText("Save")).toBeTruthy();
  });
});
