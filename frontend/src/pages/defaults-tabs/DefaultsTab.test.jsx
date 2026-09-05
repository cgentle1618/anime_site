import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DefaultsTab from "./DefaultsTab";

const noop = () => {};

function renderTab(type) {
  return render(
    <DefaultsTab
      type={type}
      draft={{ defaults: {}, autofill: [] }}
      setFieldDefault={noop}
      clearFieldDefault={noop}
      toggleAutofill={noop}
      setGroupAutofill={noop}
      sources={{ options: [], studios: [], people: {} }}
    />,
  );
}

describe("DefaultsTab", () => {
  it("offers auto-fill on a media type whose Add form has the search", () => {
    renderTab("anime");
    expect(screen.getAllByText("Auto-fill").length).toBeGreaterThan(0);
  });

  it("shows no auto-fill column on an entity tab", () => {
    // Studio, Person and Character have no "auto-fill from an existing record"
    // search on the Add page, so the whole column would be dead weight.
    renderTab("studio");

    expect(screen.queryByText("Auto-fill")).toBeNull();
    expect(screen.queryByText("Auto-fill: all")).toBeNull();
    // Not even the per-field "not auto-fillable" placeholder: a column of
    // dashes is noise on a tab where auto-fill does not exist at all.
    expect(screen.queryAllByText("—")).toHaveLength(0);
    // The fields themselves still render.
    expect(screen.getByText("Country")).toBeInTheDocument();
  });
});
