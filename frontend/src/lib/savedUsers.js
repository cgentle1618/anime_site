// Frontend: the login page's saved-username list.
//
// A convenience for swapping between the few accounts that share a machine:
// sign out, click your name, type your password. Usernames ONLY - no password
// or token is ever written here, and nothing in this file talks to the server.
// The list lives in this browser's localStorage, so it does not follow you to
// another machine and an admin cannot see who a visitor has saved.
//
// The cap does not evict. Once three names are saved, a fourth sign-in is
// simply not remembered, so a name you kept on purpose never vanishes behind
// your back - you remove one to make room.
export const SAVED_USERS_KEY = "cg1618:saved-users";
export const MAX_SAVED_USERS = 3;

function usable(name) {
  return typeof name === "string" && name.trim() !== "";
}

// Every read and write goes through a try/catch: a private window, blocked
// site data or a full quota must degrade to "no saved users", never to a
// blank login page.
export function readSavedUsers() {
  let raw;
  try {
    raw = localStorage.getItem(SAVED_USERS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set();
  const names = [];
  for (const entry of parsed) {
    if (!usable(entry)) continue;
    const name = entry.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length === MAX_SAVED_USERS) break;
  }
  return names;
}

function write(names) {
  try {
    localStorage.setItem(SAVED_USERS_KEY, JSON.stringify(names));
  } catch {
    // Nothing to do and nothing worth saying: the caller has just signed in
    // successfully, and a list that could not be saved is not an error worth
    // interrupting that with.
  }
  return names;
}

// Called on a SUCCESSFUL sign-in only, so a typo never takes one of the three
// slots. Usernames are compared exactly, because the backend authenticates
// them exactly.
export function rememberUser(username) {
  if (!usable(username)) return readSavedUsers();
  const name = username.trim();
  const current = readSavedUsers();
  const rest = current.filter((entry) => entry !== name);

  // The list is full and this is a name it does not hold: keep what is there.
  if (rest.length === current.length && current.length >= MAX_SAVED_USERS) {
    return current;
  }
  return write([name, ...rest]);
}

export function forgetUser(username) {
  const name = typeof username === "string" ? username.trim() : "";
  const current = readSavedUsers();
  const next = current.filter((entry) => entry !== name);
  return next.length === current.length ? current : write(next);
}
