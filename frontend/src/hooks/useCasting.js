// Frontend: data hooks for an entry's cast (character/person/role rows).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endpoints } from "../api/endpoints";
import { fetchJson } from "./queryUtils";

export function castingQueryKey(mediaType, entryId) {
  return ["casting", mediaType, String(entryId)];
}

export function useCasting(mediaType, entryId, options = {}) {
  const {
    enabled = true,
    staleTime = 30_000,
    queryOptions = {},
  } = options;

  return useQuery({
    queryKey: castingQueryKey(mediaType, entryId),
    queryFn: () => fetchJson(endpoints.casting.get(mediaType, entryId)),
    staleTime,
    enabled: enabled && !!mediaType && !!entryId,
    ...queryOptions,
  });
}

export function useReplaceCasting() {
  const queryClient = useQueryClient();

  return useMutation({
    // Drops any row with no character_id before it ever reaches the server.
    // CastEditor's emptyRow() starts every new row with character_id: null,
    // and the PUT schema requires it - one unfilled trailing row used to
    // 422 the WHOLE cast after the entry itself had already been saved
    // (Add.jsx/Modify.jsx surface that as "Entry saved, but cast failed to
    // save."). Filtering here, in the one place both callers share, means
    // neither has to remember to do it itself.
    mutationFn: ({ mediaType, entryId, cast }) =>
      fetchJson(endpoints.casting.replace(mediaType, entryId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cast: (cast || []).filter((row) => row && row.character_id),
        }),
      }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: castingQueryKey(variables.mediaType, variables.entryId),
      });
    },
  });
}
