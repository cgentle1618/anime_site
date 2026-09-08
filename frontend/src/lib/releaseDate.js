// Mirrors app/utils/release_date.py. Release dates are stored as YYYY,
// YYYY-MM, or YYYY-MM-DD; precision is self-describing from the length, and
// display never invents the components a value does not have.

const RELEASE_DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export function isValidReleaseDate(value) {
  // An empty field is not an error — the column is nullable.
  if (value === null || value === undefined || value === "") return true;
  if (!RELEASE_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (month !== undefined) {
    if (month < 1 || month > 12) return false;
    if (day !== undefined) {
      // Day 0 of the next month is the last day of this one.
      const lastDay = new Date(year, month, 0).getDate();
      if (day < 1 || day > lastDay) return false;
    }
  }
  return true;
}

export function formatReleaseDate(value) {
  if (value === null || value === undefined || value === "") return "TBA";
  return String(value);
}

// The year component, for sorting and for the compact "1997 – 2011" renderings.
// Returns 0 when nothing is stored so undated entries sort as the oldest under
// a descending compare and the caller can test it as falsy.
export function releaseYear(value) {
  if (value === null || value === undefined || value === "") return 0;
  return parseInt(String(value).slice(0, 4), 10) || 0;
}

// A numeric sort score, year * 10000 + month * 100 + day. Missing precision
// resolves to the FIRST of the period, matching release_date.sort_key on the
// backend, so a bare "2020" sorts level with "2020-01-01". Undated values
// score 0.
export function releaseScore(value) {
  if (value === null || value === undefined || value === "") return 0;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year) return 0;
  return year * 10000 + (month || 1) * 100 + (day || 1);
}
