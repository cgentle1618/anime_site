// Frontend: modal component file for RemarkModal.
//
// A remark can run long, so the hubs that own one (Series, Franchise,
// Collection) clip it to three rows in the hero and hand the whole thing to
// this modal rather than pushing the rest of the page down.
import { useRef } from "react";
import { Button } from "../ui/primitives";

export default function RemarkModal({ value, isAdmin, onChange, onClose }) {
  // A remark is there to be read and copied, so selecting it with the mouse
  // must not dismiss the modal. The browser fires `click` on the nearest
  // common ancestor of the mousedown and mouseup targets, so a selection drag
  // that starts on the text and is released past the panel edge dispatches its
  // click ON the backdrop - stopPropagation inside the panel never sees it.
  // Dismiss only when the press *started* on the backdrop too.
  const pressedBackdrop = useRef(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 transition-opacity"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      {/*
        No stopPropagation here: the backdrop's own handler already ignores any
        click whose target is not the backdrop itself.
      */}
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface border border-border shadow-xl w-full max-w-2xl overflow-hidden m-4"
      >
        <div className="px-6 py-3 border-b border-border flex justify-between items-center">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Remark
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-faint hover:text-text transition px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-6">
          {isAdmin ? (
            <textarea
              value={value}
              autoFocus
              onChange={(e) => onChange(e.target.value)}
              rows={16}
              className="w-full max-h-[60vh] border border-border px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand resize-none bg-surface"
            />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto text-sm text-text-muted bg-surface-2 border border-border px-3 py-2 whitespace-pre-wrap">
              {value}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end">
          <Button kind={isAdmin ? "primary" : "outline"} onClick={onClose}>
            {isAdmin ? "Save and close" : "Close"}
          </Button>
        </div>
      </div>
    </div>
  );
}
