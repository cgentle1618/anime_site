import { describe, it, expect } from "vitest";
import { isValidReleaseDate, formatReleaseDate } from "./releaseDate";

describe("isValidReleaseDate", () => {
  it("accepts the three legal shapes", () => {
    expect(isValidReleaseDate("2024")).toBe(true);
    expect(isValidReleaseDate("2024-05")).toBe(true);
    expect(isValidReleaseDate("2024-05-17")).toBe(true);
  });

  it("treats an empty value as valid so a blank field is not an error", () => {
    expect(isValidReleaseDate("")).toBe(true);
    expect(isValidReleaseDate(null)).toBe(true);
  });

  it("rejects malformed shapes", () => {
    expect(isValidReleaseDate("24")).toBe(false);
    expect(isValidReleaseDate("2024-5")).toBe(false);
    expect(isValidReleaseDate("JUL 2001")).toBe(false);
    expect(isValidReleaseDate("2024/05/17")).toBe(false);
  });

  it("rejects calendar-impossible values", () => {
    expect(isValidReleaseDate("2024-13")).toBe(false);
    expect(isValidReleaseDate("2024-02-30")).toBe(false);
    expect(isValidReleaseDate("2023-02-29")).toBe(false);
  });

  it("accepts a real leap day", () => {
    expect(isValidReleaseDate("2024-02-29")).toBe(true);
  });
});

describe("formatReleaseDate", () => {
  it("shows the stored value verbatim, never inventing precision", () => {
    expect(formatReleaseDate("2024")).toBe("2024");
    expect(formatReleaseDate("2024-05")).toBe("2024-05");
    expect(formatReleaseDate("2024-05-17")).toBe("2024-05-17");
  });

  it("shows TBA when there is nothing stored", () => {
    expect(formatReleaseDate("")).toBe("TBA");
    expect(formatReleaseDate(null)).toBe("TBA");
  });
});
