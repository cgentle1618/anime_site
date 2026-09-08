// Frontend: helper hook for keeping media query caches in sync.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MEDIA_CONFIG } from "../utils/media";
import { fetchJson } from "./queryUtils";
import { mediaItemQueryKey } from "./useMediaItem";

export function useMediaCacheUpdate(type, id) {
  const queryClient = useQueryClient();

  const setMediaItem = useCallback(
    (updated) => {
      if (!updated) return;
      queryClient.setQueryData(mediaItemQueryKey(type, id), updated);
      queryClient.setQueriesData({ queryKey: ["media-list", type] }, (old) =>
        Array.isArray(old)
          ? old.map((item) =>
              item.system_id === updated.system_id ? updated : item,
            )
          : old,
      );
    },
    [id, queryClient, type],
  );

  const fetchMediaItem = useCallback(async () => {
    const updated = await queryClient.fetchQuery({
      queryKey: mediaItemQueryKey(type, id),
      queryFn: () => fetchJson(`${MEDIA_CONFIG[type].apiEndpoint}/${id}`),
      staleTime: 0,
    });
    setMediaItem(updated);
    return updated;
  }, [id, queryClient, setMediaItem, type]);

  const invalidateMedia = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: mediaItemQueryKey(type, id) }),
        queryClient.invalidateQueries({ queryKey: ["media-list", type] }),
      ]),
    [id, queryClient, type],
  );

  return { setMediaItem, fetchMediaItem, invalidateMedia };
}

