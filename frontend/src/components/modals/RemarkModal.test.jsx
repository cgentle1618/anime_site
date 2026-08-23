// Frontend: tests for RemarkModal's backdrop-dismiss behaviour.
//
// A remark is long-form text people read and copy, so selecting it with the
// mouse must not dismiss the modal. The browser fires `click` on the nearest
// common ancestor of the mousedown and mouseup targets, so a selection drag
// that starts on the text and is released over the backdrop dispatches its
// click ON the backdrop - the panel's own handlers are never on that path.
import { render, fireEvent } from "@testing-library/react";
import RemarkModal from "./RemarkModal";

function setup(props = {}) {
  const onClose = vi.fn();
  const onChange = vi.fn();
  const { container } = render(
    <RemarkModal
      value="a long remark worth selecting"
      isAdmin={false}
      onChange={onChange}
      onClose={onClose}
      {...props}
    />,
  );
  const backdrop = container.firstChild;
  return { backdrop, panel: backdrop.firstChild, onClose, onChange };
}

describe("RemarkModal backdrop dismissal", () => {
  it("closes on a plain click on the backdrop", () => {
    const { backdrop, onClose } = setup();
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when a selection drag starts inside and ends on the backdrop", () => {
    const { backdrop, panel, onClose } = setup();
    // The drag begins on the remark text...
    fireEvent.mouseDown(panel);
    // ...and is released outside the panel, so the browser targets the click
    // at the common ancestor: the backdrop.
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close on a click inside the panel", () => {
    const { panel, onClose } = setup();
    fireEvent.mouseDown(panel);
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes via the header close button", () => {
    const { backdrop, onClose } = setup();
    const buttons = backdrop.querySelectorAll("button");
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still closes via the footer button", () => {
    const { backdrop, onClose } = setup();
    const buttons = backdrop.querySelectorAll("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a drag out of the textarea does not close the admin editor", () => {
    const { backdrop, panel, onClose } = setup({ isAdmin: true });
    const textarea = backdrop.querySelector("textarea");
    expect(textarea).not.toBeNull();
    fireEvent.mouseDown(textarea);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel).not.toBeNull();
  });
});
