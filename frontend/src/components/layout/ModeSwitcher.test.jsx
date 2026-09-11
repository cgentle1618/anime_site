import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ModeSwitcher from "./ModeSwitcher";

/**
 * The switcher's visibility is a condition over a SET - "more than one held
 * mode" - and a test asserting it is ABSENT passes for three different
 * reasons: zero modes, one mode, or a broken /api/auth/me returning none.
 * Asserting a control is missing is the vacuous direction, exactly as
 * asserting a gate refuses is.
 *
 * So the present case is the load-bearing one, and it is written to fail if
 * the endpoint stopped returning the list at all - the same fixture shape
 * feeds both, differing only in how many modes it carries.
 */

const MODES = [
  { id: "a", key: "normal", label: "Normal", is_active: true, requires_password: false },
  { id: "b", key: "safe", label: "Safe", is_active: false, requires_password: false },
];

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

let authValue = {};
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => authValue,
}));

function setup(modes) {
  authValue = {
    mode: modes[0] ? { id: modes[0].id, key: modes[0].key } : null,
    modes,
    refetchAuth: vi.fn(),
  };
  return render(<ModeSwitcher />);
}

describe("ModeSwitcher visibility", () => {
  it("renders a chooser when the account holds more than one mode", () => {
    // THE LOAD-BEARING CASE. If /api/auth/me stopped sending `modes`, this is
    // the assertion that fails; the absent-cases below would all still pass.
    setup(MODES);
    const select = screen.getByLabelText("Access mode");
    expect(select).not.toBeNull();
    expect(select.querySelectorAll("option")).toHaveLength(2);
  });

  it("renders nothing when only one mode is held", () => {
    // A control with one option is noise, not a choice.
    const { container } = setup([MODES[0]]);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no mode is held", () => {
    // A guest, or an account nobody has granted one. Same green as the case
    // above and for a different reason - which is why neither of these is the
    // test that protects the feature.
    const { container } = setup([]);
    expect(container.firstChild).toBeNull();
  });

  it("marks the modes that would need a password", () => {
    // Read from the server's flag, never recomputed here: two
    // implementations of one subset rule drift, and the browser's would be
    // the one nobody tested.
    setup([
      MODES[0],
      { ...MODES[1], id: "c", label: "Unrestricted", requires_password: true },
    ]);
    const options = screen.getByLabelText("Access mode").querySelectorAll("option");
    expect(options[0].textContent).not.toContain("🔒");
    expect(options[1].textContent).toContain("🔒");
  });
});
