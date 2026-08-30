// Frontend: layout component file for LibraryLayout.
import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { useLibraryState } from "../../hooks/useLibraryState";
import { useStatusToggle } from "../../hooks/useStatusToggle";
import MediaCard from "../cards/MediaCard";
import MediaLoadingState from "./MediaLoadingState";

// ---------------------------------------------------------------------------
// FilterTag — pill button for toggling a set-type filter value
// ---------------------------------------------------------------------------
function FilterTag({ filters, toggleFilter, group, value, label }) {
  const activeSet = filters[group];
  const active = activeSet instanceof Set && activeSet.has(value);
  return (
    <button
      onClick={() => toggleFilter(group, value)}
      className={`px-3 py-1 rounded-full border text-xs font-bold transition-colors ${
        active
          ? "bg-brand text-white border-brand"
          : "bg-surface text-text-faint border-border hover:bg-surface-2"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FilterPanel — renders all FilterDef groups for the current config
// ---------------------------------------------------------------------------
function FilterPanel({
  config,
  filters,
  toggleFilter,
  clearFilters,
  activeFilterCount,
  dynamicFilterOptions,
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-text-faint uppercase tracking-widest">
          Filters
        </span>
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-xs font-bold text-red-500 hover:text-red-700"
          >
            Clear All
          </button>
        )}
      </div>

      {config.filterDefs.map((fd) => {
        if (fd.type === "boolean") {
          return (
            <label key={fd.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters[fd.key]}
                onChange={() => toggleFilter(fd.key, null)}
                className="rounded"
              />
              <span className="text-xs font-bold text-text-muted">{fd.label}</span>
            </label>
          );
        }

        // Resolve options list
        const options =
          fd.type === "set-dynamic"
            ? (dynamicFilterOptions[fd.key] ?? [])
            : fd.type === "set-grouped"
              ? fd.groupOptions
              : fd.options;

        // Hide dynamic filters that have no data yet
        if ((fd.type === "set-dynamic") && options.length === 0) return null;

        return (
          <div key={fd.key}>
            <div className="text-xs font-bold text-text-faint mb-1.5">{fd.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {options.map((v) => (
                <FilterTag
                  key={v}
                  filters={filters}
                  toggleFilter={toggleFilter}
                  group={fd.key}
                  value={v}
                  label={v}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LibraryLayout — shared scaffold for all 7 media library pages
// ---------------------------------------------------------------------------
/**
 * Props:
 *   type        {string}   — MEDIA_CONFIG key (e.g. "anime")
 *   config      {object}   — LIBRARY_CONFIG: { filterDefs, sortDefs, defaultSort,
 *                             searchPlaceholder, buildSearchString, tableColumns }
 *   data        {object[]} — primary media array
 *   franchises  {object[]} — franchise array (pass [] if type doesn't use it)
 *   series      {object[]} — series array (pass [] if type doesn't use it)
 *   isLoading   {boolean}
 *   error       {string|null}
 */
export default function LibraryLayout({
  type,
  config,
  data,
  franchises,
  series,
  isLoading,
  error,
}) {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Build O(1) lookup dicts from raw arrays
  const franchiseDict = useMemo(
    () => Object.fromEntries((franchises ?? []).map((f) => [f.system_id, f])),
    [franchises],
  );
  const seriesDict = useMemo(
    () => Object.fromEntries((series ?? []).map((s) => [s.system_id, s])),
    [series],
  );

  const {
    searchQuery, setSearchQuery,
    currentSort, setCurrentSort,
    currentView, setCurrentView,
    showFilters, setShowFilters,
    filters, toggleFilter, clearFilters, activeFilterCount,
    dynamicFilterOptions,
    filteredAndSorted,
    handleUpdated,
  } = useLibraryState(type, config, data, franchiseDict, seriesDict);

  // -------------------------------------------------------------------------
  // Status toggle — uses the existing hook; wraps mutateAsync so the table
  // view gets the same mutation path as grid MediaCards.
  // -------------------------------------------------------------------------
  const statusToggle = useStatusToggle(type);

  const handleStatusToggle = useCallback(
    async (e, item, nextStatus, field) => {
      e.stopPropagation();
      try {
        await statusToggle.mutateAsync({ id: item.system_id, value: nextStatus, field });
        // field-specific toasts
        if (field === "watch_next" || field === "read_next") {
          showToast("success", nextStatus ? "Added to Watch/Read Next" : "Removed from Watch/Read Next");
        } else if (field === "to_rewatch" || field === "to_reread") {
          showToast("success", nextStatus ? "Marked for rewatch/reread" : "Removed from rewatch/reread");
        } else {
          showToast("success", `Status → ${nextStatus}`);
        }
      } catch {
        showToast("error", "Failed to update");
      }
    },
    [statusToggle, showToast],
  );

  // Row-click navigation
  const handleRowClick = useCallback(
    (item) => navigate(`${config.navPath}/${item.system_id}`),
    [navigate, config.navPath],
  );

  // -------------------------------------------------------------------------
  // Column render context passed to every tableColumn.render() call
  // -------------------------------------------------------------------------
  const columnCtx = useMemo(
    () => ({
      franchiseDict,
      seriesDict,
      isAdmin,
      handleStatusToggle,
    }),
    [franchiseDict, seriesDict, isAdmin, handleStatusToggle],
  );

  // -------------------------------------------------------------------------
  // Loading / error states
  // -------------------------------------------------------------------------
  if (isLoading || error) {
    return (
      <MediaLoadingState
        isLoading={isLoading}
        error={error}
        loadingText="Loading library..."
        errorTitle="Database Error"
      />
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <i className="fas fa-search absolute left-3 top-2.5 text-text-faint text-sm pointer-events-none" />
          <input
            type="text"
            placeholder={config.searchPlaceholder ?? "Search..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand bg-surface"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-text-faint hover:text-text-muted"
            >
              <i className="fas fa-times text-sm" />
            </button>
          )}
        </div>

        {/* Sort */}
        <select
          value={currentSort}
          onChange={(e) => setCurrentSort(e.target.value)}
          className="border border-border rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-surface"
        >
          {config.sortDefs.map((s) => (
            <option key={s.key} value={s.key}>
              Sort: {s.label}
            </option>
          ))}
        </select>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters((o) => !o)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-colors ${
            showFilters
              ? "bg-surface-2 border-border-strong"
              : "bg-surface border-border hover:bg-surface-2"
          }`}
        >
          <i className="fas fa-filter" /> Filters
          {activeFilterCount > 0 && (
            <span className="bg-brand text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* View toggle */}
        <div className="flex rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setCurrentView("grid")}
            className={`px-3 py-2 text-sm transition-colors ${
              currentView === "grid"
                ? "bg-brand text-white"
                : "bg-surface text-text-faint hover:text-text-muted"
            }`}
          >
            <i className="fas fa-th-large" />
          </button>
          <button
            onClick={() => setCurrentView("table")}
            className={`px-3 py-2 text-sm transition-colors ${
              currentView === "table"
                ? "bg-brand text-white"
                : "bg-surface text-text-faint hover:text-text-muted"
            }`}
          >
            <i className="fas fa-list" />
          </button>
        </div>

        <span className="text-sm font-bold text-text-faint">
          {filteredAndSorted.length} results
        </span>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          config={config}
          filters={filters}
          toggleFilter={toggleFilter}
          clearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          dynamicFilterOptions={dynamicFilterOptions}
        />
      )}

      {/* Content */}
      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-20">
          <i className="fas fa-ghost text-4xl text-text-faint/60 mb-4" />
          <p className="text-text-faint font-medium">
            No items match the current filters.
          </p>
        </div>
      ) : currentView === "grid" ? (
        /* Grid view */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredAndSorted.map((item) => (
            <MediaCard
              key={item.system_id}
              type={type}
              data={item}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="bg-surface rounded-xl border border-border overflow-auto max-h-[75vh]">
          <table className="w-full text-left">
            <thead className="bg-surface-2 border-b border-border sticky top-0 z-10">
              <tr>
                {config.tableColumns.map((col, i) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-xs font-black text-text-faint uppercase tracking-wider text-center ${
                      i < config.tableColumns.length - 1
                        ? "border-r border-border"
                        : ""
                    } ${col.thClass ?? ""}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAndSorted.map((item) => (
                <tr
                  key={item.system_id}
                  onClick={() => handleRowClick(item)}
                  className="hover:bg-indigo-50/50 transition-colors cursor-pointer"
                >
                  {config.tableColumns.map((col, i) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2 ${
                        i < config.tableColumns.length - 1
                          ? "border-r border-border"
                          : ""
                      } ${col.tdClass ?? ""}`}
                      onClick={col.stopPropagation ? (e) => e.stopPropagation() : undefined}
                    >
                      {col.render(item, columnCtx)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

