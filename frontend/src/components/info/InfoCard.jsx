// Frontend: info component file for InfoCard.
export function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-text-faint uppercase tracking-wider font-bold mb-1">
        {label}
      </div>
      <div className="text-sm font-medium text-text">
        {value != null && value !== "" ? value : "-"}
      </div>
    </div>
  );
}

export default function InfoCard({ title, icon, fields }) {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="bg-surface-2 border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="font-bold text-text">
          <i className={`fas ${icon} text-brand mr-2`}></i>
          {title}
        </h3>
      </div>
      <div className="p-4 space-y-3">
        {fields.map((row, i) =>
          Array.isArray(row) ? (
            <div
              key={i}
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}
            >
              {row.map(({ label, value }) => (
                <InfoRow key={label} label={label} value={value} />
              ))}
            </div>
          ) : (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ),
        )}
      </div>
    </div>
  );
}

