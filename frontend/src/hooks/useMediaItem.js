import { useQuery } from "@tanstack/react-query";
import { MEDIA_CONFIG } from "../utils/media";
import { fetchJson } from "./queryUtils";

export function mediaItemQueryKey(type, id) {
  return ["media-item", type, String(id)];
}

export function useMediaItem(type, id, options = {}) {
  const {
    enabled = true,
    staleTime = 30_000,
    queryOptions = {},
  } = options;
  const endpoint = MEDIA_CONFIG[type]?.apiEndpoint;

  return useQuery({
    queryKey: mediaItemQueryKey(type, id),
    queryFn: () => fetchJson(`${endpoint}/${id}`),
    staleTime,
    enabled: enabled && !!endpoint && !!id,
    ...queryOptions,
  });
}

