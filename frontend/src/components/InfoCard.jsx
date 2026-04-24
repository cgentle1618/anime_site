export function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">
        {label}
      </div>
      <div className="text-sm font-medium text-gray-800">
        {value != null && value !== "" ? value : "-"}
      </div>
    </div>
  );
}

export default function InfoCard({ title, icon, fields }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h3 className="font-bold text-gray-800">
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
