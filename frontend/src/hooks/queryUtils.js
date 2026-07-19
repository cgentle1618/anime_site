// Barrel — buildUrl/fetchJson now live in the api layer (src/api/client.js).
// Kept so existing "./queryUtils" imports keep working.
export { buildUrl, fetchJson } from "../api/client";
