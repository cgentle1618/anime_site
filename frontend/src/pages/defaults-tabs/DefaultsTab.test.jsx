import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DefaultsTab from "./DefaultsTab";

const noop = () => {};

function renderTab(type, draft = { defaults: {}, autofill: [] }) {
  return render(
    <DefaultsTab
      type={type}
      draft={draft}
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

  it("edits the sources default with the same editor the Add form uses", () => {
    renderTab("anime");

    // The repeater renders in place of the old "No default for this field".
    expect(screen.getByText("Main Sources")).toBeInTheDocument();
    expect(screen.getByText("+ Add reference source")).toBeInTheDocument();
  });

  it("hides main sources on the Game tab, mirroring its Add form", () => {
    renderTab("game");

    expect(screen.queryByText("Main Sources")).toBeNull();
    expect(screen.getByText("+ Add reference source")).toBeInTheDocument();
  });

  it("edits the game copies default with the copies editor", () => {
    renderTab("game", {
      defaults: { copies: [{ storefront: "Steam", ownership: "Owned" }] },
      autofill: [],
    });

    expect(screen.getByText("+ Add copy")).toBeInTheDocument();
    expect(screen.getByLabelText("Ownership for Steam")).toHaveValue("Owned");
  });
});
