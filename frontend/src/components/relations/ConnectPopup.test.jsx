// Frontend: tests for the drag-to-connect popup.
//
// The popup exists so a misdrop costs a keystroke instead of a database row,
// so the tests care most about what it does NOT do: write anything before the
// user confirms.
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ConnectPopup from "./ConnectPopup";

const KINDS = [
  { key: "prequel", label: "Prequel", family: "timeline", symmetric: false },
  { key: "sequel", label: "Sequel", family: "timeline", symmetric: false },
  { key: "adaptation", label: "Adaptation", family: "derivation", symmetric: false },
];

function setup(props = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConnectPopup
      kinds={KINDS}
      source={{ key: "anime:a", display_name: "Fate/Zero" }}
      target={{ key: "anime:b", display_name: "Fate/stay night" }}
      position={{ x: 100, y: 100 }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConnectPopup", () => {
  it("reads the relation as a sentence naming both entries", () => {
    setup();
    const sentence = screen.getByTestId("connect-sentence");
    expect(sentence).toHaveTextContent("Fate/Zero");
    expect(sentence).toHaveTextContent("Fate/stay night");
  });

  it("writes nothing until the user confirms", async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("button", { name: /adaptation/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms with the chosen kind and both node keys", async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("button", { name: /adaptation/i }));
    await userEvent.click(screen.getByRole("button", { name: /^add relation$/i }));
    expect(onConfirm).toHaveBeenCalledWith({
      kind: "adaptation",
      from: "anime:a",
      to: "anime:b",
      remark: null,
    });
  });

  it("swaps which entry is the subject", async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("button", { name: /swap/i }));
    await userEvent.click(screen.getByRole("button", { name: /^add relation$/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ from: "anime:b", to: "anime:a" }),
    );
  });

  it("cancels on Escape", () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stays open showing a server error", () => {
    setup({ error: "That relation already exists." });
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByTestId("connect-sentence")).toBeInTheDocument();
  });

  it("cannot be submitted without a target when the drop was on empty canvas", () => {
    setup({ target: null });
    expect(screen.getByRole("button", { name: /^add relation$/i })).toBeDisabled();
  });
});
