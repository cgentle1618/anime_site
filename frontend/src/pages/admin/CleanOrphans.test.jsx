import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CleanOrphansReport } from "./CleanOrphans";

/**
 * The review screen's job is to be honest about what disappears. These tests
 * pin the three claims that make it honest: nothing is selected for you,
 * select-all will not sweep up rows you made since the last backup, and a
 * quote is shown as surviving rather than as deleted.
 */

const report = {
  last_backup_at: "2026-09-10T10:00:00",
  totals: { candidates: 2, list_rows: 1 },
  anomalies: [],
  tabs: {
    Media: [
      {
        tab: "Media",
        system_id: "a",
        public_id: 12,
        label: "Anime",
        display_name: "Old Show",
        created_at: "2026-09-01T00:00:00",
        updated_at: "2026-09-01T00:00:00",
        children: 0,
        blast_radius: {
          deleted: { credits: 7, list_rows: 1 },
          detached: { quotes: 2 },
        },
      },
      {
        tab: "Media",
        system_id: "b",
        public_id: 13,
        label: "Anime",
        display_name: "Added Today",
        created_at: "2026-09-11T09:00:00",
        updated_at: "2026-09-11T09:00:00",
        children: 0,
        blast_radius: { deleted: {}, detached: {} },
      },
    ],
    Collection: [],
  },
};

function renderReport(overrides = {}) {
  return render(
    <CleanOrphansReport report={{ ...report, ...overrides }} onApply={() => {}} />,
  );
}

describe("CleanOrphansReport", () => {
  it("starts with nothing selected", () => {
    renderReport();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    boxes.forEach((box) => expect(box.checked).toBe(false));
  });

  it("select-all skips rows created after the last backup", () => {
    renderReport();
    fireEvent.click(screen.getByTestId("select-all-Media"));
    expect(screen.getByTestId("row-a").checked).toBe(true);
    expect(screen.getByTestId("row-b").checked).toBe(false);
  });

  it("marks a row newer than the last backup", () => {
    renderReport();
    expect(screen.getByTestId("newer-b")).toBeTruthy();
    expect(screen.queryByTestId("newer-a")).toBeNull();
  });

  it("still lets a newer row be ticked by hand", () => {
    renderReport();
    fireEvent.click(screen.getByTestId("row-b"));
    expect(screen.getByTestId("row-b").checked).toBe(true);
  });

  it("shows deleted and detached counts as different things", () => {
    renderReport();
    const summary = screen.getByTestId("blast-a").textContent;
    expect(summary).toMatch(/7/);
    expect(summary).toMatch(/delete/i);
    expect(summary).toMatch(/2/);
    expect(summary).toMatch(/detach|survive|keep/i);
  });

  it("calls back with exactly the ticked ids", () => {
    let sent = null;
    render(
      <CleanOrphansReport report={report} onApply={(items) => (sent = items)} />,
    );
    fireEvent.click(screen.getByTestId("row-a"));
    fireEvent.click(screen.getByTestId("apply"));
    expect(sent).toEqual([{ tab: "Media", system_id: "a" }]);
  });

  it("will not apply when nothing is ticked", () => {
    let called = false;
    render(
      <CleanOrphansReport report={report} onApply={() => (called = true)} />,
    );
    fireEvent.click(screen.getByTestId("apply"));
    expect(called).toBe(false);
  });

  it("says so plainly when there has never been a successful backup", () => {
    renderReport({ last_backup_at: null });
    expect(screen.getByTestId("backup-stamp").textContent).toMatch(/never|no /i);
  });

  it("treats every row as new when there is no backup to compare against", () => {
    renderReport({ last_backup_at: null });
    fireEvent.click(screen.getByTestId("select-all-Media"));
    expect(screen.getByTestId("row-a").checked).toBe(false);
    expect(screen.getByTestId("row-b").checked).toBe(false);
  });

  it("surfaces anomalies rather than hiding them", () => {
    renderReport({ anomalies: ["Anime: 3 detail row(s) have no media parent."] });
    expect(screen.getByTestId("anomalies").textContent).toMatch(/no media parent/);
  });
});
