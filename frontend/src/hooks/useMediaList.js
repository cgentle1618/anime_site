import { useQuery } from "@tanstack/react-query";
import { MEDIA_CONFIG } from "../utils/media";
import { buildUrl, fetchJson } from "./queryUtils";

export function mediaListQueryKey(type, params) {
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
    queryKey: mediaListQueryKey(type, params),
    queryFn: () => fetchJson(url),
    staleTime,
    enabled: enabled && !!url,
    ...queryOptions,
  });
}

