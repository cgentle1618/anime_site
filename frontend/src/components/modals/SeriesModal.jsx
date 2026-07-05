// Frontend: modal component file for SeriesModal.
import { Link } from "react-router-dom";
import { InfoRow } from "../info/InfoCard";

export default function SeriesModal({ series, isAdmin, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-black text-gray-800 flex items-center">
            <i className="fas fa-layer-group text-purple-500 mr-2"></i>Series
            Hub Information
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition bg-white hover:bg-gray-100 rounded-lg p-1.5 focus:outline-none"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <InfoRow label="Chinese Name" value={series.series_name_cn} />
          <InfoRow label="English Name" value={series.series_name_en} />
          <InfoRow label="Alternative Name" value={series.series_name_alt} />
          {series.remark && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">
                Remark
              </div>
              <div className="text-sm text-gray-700 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 whitespace-pre-wrap">
                {series.remark}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          {isAdmin && (
            <Link
              to={`/modify?id=${series.system_id}`}
              className="text-xs font-bold text-brand hover:underline flex items-center"
              onClick={onClose}
            >
              <i className="fas fa-edit mr-2"></i> Edit Series Data
            </Link>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-100 transition shadow-sm focus:outline-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

