// Frontend: data hooks for the image library.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endpoints } from "../api/endpoints";
import { fetchJson } from "./queryUtils";

export function imagesQueryKey(filters = {}) {
  return ["images", filters];
}

export function useImages(filters = {}, options = {}) {
  const params = new URLSearchParams();
  if (filters.unused) params.set("unused", "true");
  if (filters.missing) params.set("missing", "true");
  if (filters.duplicates) params.set("duplicates", "true");
  if (filters.q) params.set("q", filters.q);
  if (filters.limit != null) params.set("limit", String(filters.limit));
  if (filters.offset != null) params.set("offset", String(filters.offset));

  return useQuery({
    queryKey: imagesQueryKey(filters),
    queryFn: () => fetchJson(endpoints.images.list(params.toString())),
    staleTime: 30_000,
    ...options,
  });
}

export function useUploadImage() {
  const queryClient = useQueryClient();

  return useMutation({
    // FormData, and deliberately NO Content-Type header: the browser has to
    // set it itself so that it carries the multipart boundary. Setting it by
    // hand produces a body the server cannot parse. fetchJson spreads
    // `options` and sets no default Content-Type, so a FormData body passes
    // through untouched.
    mutationFn: (file) => {
      const body = new FormData();
      body.append("file", file);
      return fetchJson(endpoints.images.upload(), { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}

export function useAttachImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ imageId, ownerType, ownerId, role = "cover" }) =>
      fetchJson(endpoints.images.attach(imageId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_type: ownerType,
          owner_id: ownerId,
          role,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}

export function useDetachImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ imageId, attachmentId }) =>
      fetchJson(endpoints.images.detach(imageId, attachmentId), {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}

// Unused-only by design: the manager page never offers `force`. To remove an
// attached image, detach it first (useDetachImage) - two deliberate steps.
export function useDeleteImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ imageId }) =>
      fetchJson(endpoints.images.remove(imageId), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
    },
  });
}
