// Frontend: modal component file for FranchiseCreateModal.
import { useState } from "react";
import { inputCls, selectCls } from "../forms/FormField";
import { Button, Eyebrow } from "../ui/primitives";

export default function FranchiseCreateModal({
  onConfirm,
  onCancel,
  franchiseType = "ACG",
}) {
  const [expectation, setExpectation] = useState("Low");
  const [remark, setRemark] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface border border-border shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-border">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
            Create new franchise
          </h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-text-muted">
            A new franchise will be created using the names you filled in,
            with type set to{" "}
            <span className="font-semibold text-text">{franchiseType}</span>.
          </p>
          <div>
            <Eyebrow as="label" className="block mb-1">
              Expectation
            </Eyebrow>
            <select
              value={expectation}
              onChange={(e) => setExpectation(e.target.value)}
              className={selectCls}
            >
              {["Highest", "High", "Medium", "Low"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Eyebrow as="label" className="block mb-1">
              Remark
            </Eyebrow>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="Optional notes about this franchise"
            />
          </div>
        </div>
        <div className="px-6 py-3 border-t border-border flex gap-2 justify-end">
          <Button onClick={onCancel}>Cancel</Button>
          <Button kind="primary" onClick={() => onConfirm(expectation, remark)}>
            Create and proceed
          </Button>
        </div>
      </div>
    </div>
  );
}
