// Frontend: helper hook for toggling watch or status values.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MEDIA_CONFIG } from "../utils/media";
import { fetchJson } from "./queryUtils";
import { mediaItemQueryKey } from "./useMediaItem";

export function useStatusToggle(type) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, value, field, fields }) => {
      const { apiEndpoint, statusField } = MEDIA_CONFIG[type];
      const body = fields || { [field || statusField]: value };
      return fetchJson(`${apiEndpoint}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(mediaItemQueryKey(type, variables.id), updated);
      queryClient.setQueriesData(
        { queryKey: ["media-list", type] },
        (old) =>
          Array.isArray(old)
            ? old.map((item) =>
                item.system_id === updated.system_id ? updated : item,
              )
            : old,
      );
      queryClient.invalidateQueries({ queryKey: ["media-list", type] });
    },
  });
}


