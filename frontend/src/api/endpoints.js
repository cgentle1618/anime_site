// Frontend: centralized API endpoint builders — the single source of URL truth.
// Import these instead of hardcoding "/api/..." strings in components.
import { MEDIA_CONFIG } from "../config/mediaRegistry";

// Generic CRUD path builder for a base like "/api/anime".
function crud(base) {
  return {
    list: () => `${base}/`,
    detail: (id) => `${base}/${id}`,
    create: () => `${base}/`,
    update: (id) => `${base}/${id}`,
    patch: (id) => `${base}/${id}`,
    remove: (id) => `${base}/${id}`,
  };
}

// Per-type resource endpoints, derived from the media registry.
// Works for every key in MEDIA_CONFIG (anime, movie, manga, franchise, series, ...).
export function resource(type) {
  const cfg = MEDIA_CONFIG[type];
  if (!cfg) throw new Error(`Unknown resource type: ${type}`);
  return {
    ...crud(cfg.apiEndpoint),
    complete: (id) => `${cfg.apiEndpoint}/${id}/complete`,
  };
}

export const endpoints = {
  resource,

  auth: {
    login: () => "/api/auth/login",
    logout: () => "/api/auth/logout",
    me: () => "/api/auth/me",
  },

  options: {
    list: () => "/api/options/",
    byCategory: (category) => `/api/options/${category}`,
    create: () => "/api/options/",
    update: (id) => `/api/options/${id}`,
    remove: (id) => `/api/options/${id}`,
  },

  seasonal: {
    list: () => "/api/seasonal/",
    detail: (id) => `/api/seasonal/${id}`,
    currentSeason: () => "/api/seasonal/current-season",
    update: (id) => `/api/seasonal/${id}`,
  },

  announcements: {
    list: () => "/api/announcements/",
    create: () => "/api/announcements/",
    update: () => "/api/announcements/",
    remove: (title) => `/api/announcements/?title=${encodeURIComponent(title)}`,
  },

  // Watch orders don't fit the resource() CRUD shape: lists and their items
  // live under one prefix, and reorder is its own verb.
  watchOrder: {
    lists: () => "/api/watch-order/lists",
    list: (id) => `/api/watch-order/lists/${id}`,
    createList: () => "/api/watch-order/lists",
    updateList: (id) => `/api/watch-order/lists/${id}`,
    patchList: (id) => `/api/watch-order/lists/${id}`,
    removeList: (id) => `/api/watch-order/lists/${id}`,
    duplicateList: (id) => `/api/watch-order/lists/${id}/duplicate`,
    createItem: (listId) => `/api/watch-order/lists/${listId}/items`,
    updateItem: (itemId) => `/api/watch-order/items/${itemId}`,
    patchItem: (itemId) => `/api/watch-order/items/${itemId}`,
    removeItem: (itemId) => `/api/watch-order/items/${itemId}`,
    reorder: (listId) => `/api/watch-order/lists/${listId}/reorder`,
    candidates: () => "/api/watch-order/candidates",
    createRelease: () => "/api/watch-order/lists/release",
    backfillRelease: () => "/api/watch-order/lists/release/backfill",
  },

  formDefaults: {
    list: () => "/api/form-defaults/",
    detail: (type) => `/api/form-defaults/${type}`,
    update: (type) => `/api/form-defaults/${type}`,
    reset: (type) => `/api/form-defaults/${type}`,
  },

  system: {
    currentSeason: () => "/api/system/config/current_season",
    logs: () => "/api/system/logs",
    log: (id) => `/api/system/logs/${id}`,
    deleted: () => "/api/system/deleted",
    deletedRecord: (id) => `/api/system/deleted/${id}`,
    testBucket: () => "/api/system/test-bucket",
  },

  quotes: {
    list: (qs = "") => `/api/quote/${qs ? `?${qs}` : ""}`,
    grouped: (qs = "") => `/api/quote/grouped${qs ? `?${qs}` : ""}`,
    byEntry: (mediaType, entryId) =>
      `/api/quote/?media_type=${mediaType}&entry_id=${entryId}`,
    detail: (id) => `/api/quote/${id}`,
    create: () => "/api/quote/",
    update: (id) => `/api/quote/${id}`,
    patch: (id) => `/api/quote/${id}`,
    remove: (id) => `/api/quote/${id}`,
  },

  memes: {
    list: (qs = "") => `/api/meme/${qs ? `?${qs}` : ""}`,
    grouped: (qs = "") => `/api/meme/grouped${qs ? `?${qs}` : ""}`,
    byOwner: (ownerType, ownerId) =>
      `/api/meme/?owner_type=${ownerType}&owner_id=${ownerId}`,
    detail: (id) => `/api/meme/${id}`,
    create: () => "/api/meme/",
    update: (id) => `/api/meme/${id}`,
    patch: (id) => `/api/meme/${id}`,
    remove: (id) => `/api/meme/${id}`,
  },

  dataControl: {
    fill: (type) => `/api/data-control/fill/${type}`,
    fillAll: () => "/api/data-control/fill/all",
    replace: (type) => `/api/data-control/replace/${type}`,
    replaceSingle: (type, id) => `/api/data-control/replace/${type}/${id}`,
    replaceAll: () => "/api/data-control/replace/all",
    pull: (tab) => `/api/data-control/pull/${tab}`,
    pullAll: () => "/api/data-control/pull",
    backup: () => "/api/data-control/backup",
    calculateAll: () => "/api/data-control/calculate/all",
    checkDuplicates: () => "/api/data-control/check/duplicates",
    checkRemarks: () => "/api/data-control/check/remarks",
    checkCoverImage: () => "/api/data-control/calculate/check-cover-image",
    setCoverFields: () => "/api/data-control/calculate/set-cover-image-fields",
    downloadMissingCovers: () => "/api/data-control/calculate/download-missing-covers",
    deleteOrphanedCovers: () => "/api/data-control/calculate/delete-orphaned-covers",
  },
};
