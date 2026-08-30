// Frontend: form component file for FormField.
export const inputCls =
  "w-full border border-border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface";
export const selectCls =
  "w-full border border-border rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-surface";

export function Field({ label, required, half, hint, children }) {
  return (
    <div className={half ? "" : ""}>
      <label className="block text-[10px] font-bold text-text-faint uppercase tracking-wider mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-text-faint mt-0.5">{hint}</p>}
    </div>
  );
}

// A franchise can belong to a collection, and an entry filed under that
// franchise inherits the grouping without ever naming it. Shown under the
// Franchise picker so the wider grouping is visible while editing; read-only,
// since navigating away would drop an unsaved form.
export function CollectionNote({ franchiseId, franchiseCollections }) {
  const name = franchiseId ? franchiseCollections?.[franchiseId] : null;
  if (!name) return null;
  return (
    <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">
      <i className="fas fa-box-open text-purple-400"></i>
      Collection: {name}
    </p>
  );
}

export function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-border mt-6 mb-4">
      <i className={`fas ${icon} text-brand text-sm`}></i>
      <span className="text-xs font-black text-text-muted uppercase tracking-widest">
        {title}
      </span>
    </div>
  );
}
