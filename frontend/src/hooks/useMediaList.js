// Frontend: data hook for loading media lists with React Query.
import { useQuery } from "@tanstack/react-query";
import { MEDIA_CONFIG } from "../utils/media";
import { buildUrl, fetchJson } from "./queryUtils";

/**
 * Standard options for fetching a full library list (up to 2000 items).
 * Import and spread into useMediaList calls: useMediaList("anime", LIST_OPTIONS)
 */
export const LIST_OPTIONS = { params: { limit: 2000 } };

export function mediaListQueryKey(type, params) {
  // Each media type gets its own cache bucket, with params included when needed.
  return params ? ["media-list", type, params] : ["media-list", type];
}

export function useMediaList(type, options = {}) {
  const {
    params,
    enabled = true,
    staleTime = 30_000,
    queryOptions = {},
  } = options;
  const endpoint = MEDIA_CONFIG[type]?.apiEndpoint;
  const url = endpoint ? buildUrl(`${endpoint}/`, params) : null;

  return useQuery({
    // Disabled automatically when the type is unknown, which avoids bad fetches.
    queryKey: mediaListQueryKey(type, params),
    queryFn: () => fetchJson(url),
    staleTime,
    enabled: enabled && !!url,
    ...queryOptions,
  });
}


