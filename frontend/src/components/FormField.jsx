export function Field({ label, required, half, hint, children }) {
  return (
    <div className={half ? "" : ""}>
      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 mt-6 mb-4">
      <i className={`fas ${icon} text-brand text-sm`}></i>
      <span className="text-xs font-black text-gray-600 uppercase tracking-widest">
        {title}
      </span>
    </div>
  );
}
