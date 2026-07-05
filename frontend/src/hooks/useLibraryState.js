// Frontend: state hook for library page filters and selections.
import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cleanString } from "../utils/media";

// ---------------------------------------------------------------------------
// FilterDef type reference
// ---------------------------------------------------------------------------
// Each FilterDef in config.filterDefs has the shape:
//
//   { key, label, type, ...typeSpecificProps, match }
//
// Supported types:
//   "set"          — static option list; filter.key is a Set of selected values
//   "set-dynamic"  — options derived from data at runtime via deriveOptions(data)
//   "set-grouped"  — options are group labels; match uses a groupMap to normalise
//                    the raw item field value before comparing
//   "boolean"      — single toggle; filter.key is a boolean
//
// match signature (called only when the filter is active):
//   (item, activeValue, franchiseDict, seriesDict) => boolean
//
// SortDef shape:
//   { key, label, compare(a, b, franchiseDict, seriesDict) => number }
// ---------------------------------------------------------------------------

/**
 * Centralised state and computation hook for all library pages.
 *
 * @param {string}   type          - MEDIA_CONFIG key (e.g. "anime")
 * @param {object}   config        - LIBRARY_CONFIG for this media type
 * @param {object[]} data          - primary media array from the API
 * @param {object}   franchiseDict - system_id → franchise object lookup
 * @param {object}   seriesDict    - system_id → series object lookup
 */
export function useLibraryState(type, config, data, franchiseDict, seriesDict) {
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Filter state — shape is derived from config.filterDefs
  // -------------------------------------------------------------------------
  const initFilters = useCallback(
    () =>
      Object.fromEntries(
        config.filterDefs.map((fd) => [
          fd.key,
          fd.type === "boolean" ? false : new Set(),
        ]),
      ),
    [config.filterDefs],
  );

  const [searchQuery, setSearchQuery]   = useState("");
  const [currentSort, setCurrentSort]   = useState(config.defaultSort ?? "title");
  const [currentView, setCurrentView]   = useState("grid");
  const [showFilters, setShowFilters]   = useState(false);
  const [filters, setFilters]           = useState(initFilters);

  // -------------------------------------------------------------------------
  // Dynamic filter options — computed once from data for "set-dynamic" defs
  // -------------------------------------------------------------------------
  const dynamicFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        config.filterDefs
          .filter((fd) => fd.type === "set-dynamic")
          .map((fd) => [fd.key, fd.deriveOptions(data)]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, config.filterDefs],
  );

  // -------------------------------------------------------------------------
  // Filter helpers
  // -------------------------------------------------------------------------
  const toggleFilter = useCallback((group, value) => {
    setFilters((prev) => {
      const current = prev[group];
      if (typeof current === "boolean") {
        return { ...prev, [group]: !current };
      }
      const next = new Set(current);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...prev, [group]: next };
    });
  }, []);

  const clearFilters = useCallback(() => setFilters(initFilters()), [initFilters]);

  const activeFilterCount = useMemo(
    () =>
      Object.values(filters).reduce(
        (n, v) => n + (v instanceof Set ? v.size : v ? 1 : 0),
        0,
      ),
    [filters],
  );

  // -------------------------------------------------------------------------
  // Cache-patch callback — used by grid MediaCard onUpdated prop
  // -------------------------------------------------------------------------
  const handleUpdated = useCallback(
    (updatedItem) => {
      queryClient.setQueriesData({ queryKey: ["media-list", type] }, (old) =>
        Array.isArray(old)
          ? old.map((item) =>
              item.system_id === updatedItem.system_id ? updatedItem : item,
            )
          : old,
      );
    },
    [queryClient, type],
  );

  // -------------------------------------------------------------------------
  // Filtered and sorted data — search → filter → sort pipeline
  // -------------------------------------------------------------------------
  const filteredAndSorted = useMemo(() => {
    const q = cleanString(searchQuery);

    // 1. Search
    let result = q
      ? data.filter((item) => {
          const haystack = cleanString(
            config.buildSearchString(item, franchiseDict, seriesDict),
          );
          return haystack.includes(q);
        })
      : [...data];

    // 2. Filter — only apply active FilterDefs
    for (const fd of config.filterDefs) {
      const activeValue = filters[fd.key];
      const isActive =
        activeValue instanceof Set ? activeValue.size > 0 : !!activeValue;

      if (!isActive) continue;

      result = result.filter((item) =>
        fd.match(item, activeValue, franchiseDict, seriesDict),
      );
    }

    // 3. Sort
    const sortDef = config.sortDefs.find((s) => s.key === currentSort);
    if (sortDef) {
      result.sort((a, b) =>
        sortDef.compare(a, b, franchiseDict, seriesDict),
      );
    }

    return result;
  }, [
    data,
    searchQuery,
    filters,
    currentSort,
    franchiseDict,
    seriesDict,
    config,
  ]);

  return {
    // UI state
    searchQuery,  setSearchQuery,
    currentSort,  setCurrentSort,
    currentView,  setCurrentView,
    showFilters,  setShowFilters,
    // Filter state & helpers
    filters,
    toggleFilter,
    clearFilters,
    activeFilterCount,
    dynamicFilterOptions,
    // Computed data
    filteredAndSorted,
    // Cache helper
    handleUpdated,
  };
}

