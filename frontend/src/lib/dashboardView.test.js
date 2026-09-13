// Frontend: unit tests for the dashboard's card/list view preference.
/**
 * The preference is a per-device display choice and nothing more. Every path
 * out of this module must yield one of the two known modes, because the
 * caller uses the result to pick a layout and has no third branch to fall
 * into - a stored value that is missing, corrupt, or from a future version of
 * the app has to read as "cards", not as undefined.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DASHBOARD_VIEW_KEY,
  DEFAULT_VIEW,
  readDashboardView,
  writeDashboardView,
} from "./dashboardView";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("readDashboardView", () => {
  it("defaults to cards when nothing is stored", () => {
    expect(readDashboardView()).toBe("card");
  });

  it("reads back a stored mode", () => {
    localStorage.setItem(DASHBOARD_VIEW_KEY, "list");
    expect(readDashboardView()).toBe("list");
  });

  it("falls back to cards on a value it does not recognise", () => {
    localStorage.setItem(DASHBOARD_VIEW_KEY, "table");
    expect(readDashboardView()).toBe(DEFAULT_VIEW);
  });

  it("falls back to cards when localStorage throws", () => {
    // A private window or blocked site data must degrade to the default
    // layout, never to a dashboard that fails to render.
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
    });
    expect(readDashboardView()).toBe(DEFAULT_VIEW);
  });
});

describe("writeDashboardView", () => {
  it("stores a known mode and returns it", () => {
    expect(writeDashboardView("list")).toBe("list");
    expect(localStorage.getItem(DASHBOARD_VIEW_KEY)).toBe("list");
  });

  it("refuses an unknown mode and stores nothing", () => {
    expect(writeDashboardView("table")).toBe(DEFAULT_VIEW);
    expect(localStorage.getItem(DASHBOARD_VIEW_KEY)).toBe(null);
  });

  it("still returns the mode when localStorage throws", () => {
    // The toggle has already moved on screen by the time this runs. A quota
    // or permissions failure means the choice does not outlive the tab, which
    // is not worth interrupting the viewer over.
    vi.stubGlobal("localStorage", {
      setItem() {
        throw new Error("quota");
      },
    });
    expect(writeDashboardView("list")).toBe("list");
  });
});
