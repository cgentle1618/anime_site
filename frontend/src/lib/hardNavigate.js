// Frontend: leave the SPA and load a URL from scratch.
//
// Used when WHO the session is changes - sign in, sign out, access-mode
// switch. A client-side route change is not enough there: the answers already
// in the React Query cache were computed for the previous identity, and
// `staleTime` serves them again without asking the server, so a signed-out
// visitor keeps seeing the last account's list until something happens to
// evict them. Component state holds the same stale rows in places the cache
// does not reach at all.
//
// Clearing the query cache would fix the first half and not the second. A
// full load fixes both by construction and is what a browser already knows
// how to do, so identity changes take it.
export function hardNavigate(url) {
  window.location.assign(url);
}
