// useReplaceCasting's mutationFn is the ONE place both Add.jsx and
// Modify.jsx route a form's cast through on the way to PUT
// /api/casting/{media_type}/{entry_id}. CastEditor's emptyRow() starts every
// new row with character_id: null, and the server schema requires
// character_id on every row it does not drop itself - so a single unfilled
// trailing row used to 422 the WHOLE cast after the entry had already been
// saved. This filters those rows out before the request ever leaves the
// browser.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useReplaceCasting } from "./useCasting";

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "success" }),
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("drops a blank trailing row (no character_id) before PUTting the cast", async () => {
  const { result } = renderHook(() => useReplaceCasting(), { wrapper });

  const cast = [
    { character_id: "c1", role: "Main", position: 0 },
    // The blank row CastEditor's "+ Add cast member" leaves behind if the
    // admin never fills it in.
    { character_id: null, character_name: "", role: "", position: 1 },
  ];

  result.current.mutate({ mediaType: "anime", entryId: "e1", cast });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(fetch).toHaveBeenCalledTimes(1);
  const [, init] = fetch.mock.calls[0];
  const sentBody = JSON.parse(init.body);
  expect(sentBody.cast).toHaveLength(1);
  expect(sentBody.cast[0].character_id).toBe("c1");
});
