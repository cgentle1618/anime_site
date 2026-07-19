// Frontend: reusable media mutation hooks (create / update / patch / complete / delete).
// Each is parameterized by media type and keeps the React Query cache consistent,
// mirroring the existing useStatusToggle pattern. URLs come from endpoints.js.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { mediaItemQueryKey } from "../../hooks/useMediaItem";

function invalidate(queryClient, type, id) {
  queryClient.invalidateQueries({ queryKey: ["media-list", type] });
  if (id) queryClient.invalidateQueries({ queryKey: mediaItemQueryKey(type, id) });
}

export function useCreateMedia(type) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      fetchJson(endpoints.resource(type).create(), { method: "POST", ...jsonBody(data) }),
    onSuccess: (created) => invalidate(queryClient, type, created?.system_id),
  });
}

export function useUpdateMedia(type) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      fetchJson(endpoints.resource(type).update(id), { method: "PUT", ...jsonBody(data) }),
    onSuccess: (_updated, { id }) => invalidate(queryClient, type, id),
  });
}

export function usePatchMedia(type) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      fetchJson(endpoints.resource(type).patch(id), { method: "PATCH", ...jsonBody(data) }),
    onSuccess: (_updated, { id }) => invalidate(queryClient, type, id),
  });
}

export function useCompleteMedia(type) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      fetchJson(endpoints.resource(type).complete(id), { method: "POST" }),
    onSuccess: (_updated, id) => invalidate(queryClient, type, id),
  });
}

export function useDeleteMedia(type) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      fetchJson(endpoints.resource(type).remove(id), { method: "DELETE" }),
    onSuccess: (_res, id) => invalidate(queryClient, type, id),
  });
}
