// Frontend: modal component file for FranchiseCreateModal.
import { useState } from "react";
import { inputCls, selectCls } from "../forms/FormField";

export default function FranchiseCreateModal({
  onConfirm,
  onCancel,
  franchiseType = "ACG",
}) {
  const [expectation, setExpectation] = useState("Low");
  const [remark, setRemark] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="bg-brand-soft border-b border-brand/10 px-6 py-4 flex items-center gap-3">
          <i className="fas fa-sitemap text-brand text-xl"></i>
          <h3 className="font-black text-text">Create New Franchise</h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-text-muted">
            A new <span className="font-bold">Franchise</span> will be created
            using the names you filled in, with type set to{" "}
            <span className="font-bold">{franchiseType}</span>.
          </p>
          <div>
            <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
              Expectation
            </label>
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
            <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
              Remark
            </label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="Optional notes about this franchise..."
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-border rounded-lg text-sm font-bold text-text-muted hover:bg-surface-2 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(expectation, remark)}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-bold hover:bg-brand-hover transition"
          >
            Create & Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

