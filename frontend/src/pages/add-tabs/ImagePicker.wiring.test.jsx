// Frontend: an Add tab has no row id yet, so its cover/photo/logo field must
// render ImagePicker in "no owner" mode (skip-attach, hand the picked image
// id up as pending_image_id) rather than the old hand-typed storage-key text
// box. This is a rendering smoke test across the representative shapes: a
// media-entry tab that owns its field directly (AnimeAddTab), the four
// entity tabs that share their field markup with their Modify counterpart
// (Person/Character/Publisher/Studio), and the Game pair, whose Add and
// Modify tabs share one GameFormBody - see GameModifyTab.jsx's own comment.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// GameFormBody asks who is editing to gate the Copies section on
// self.list - unrelated to this test, so the account is whatever is
// convenient (see GameAddTab.test.jsx).
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true }),
}));

import AnimeAddTab, { defaultAnime } from "./AnimeAddTab";
import PersonAddTab, { defaultPerson } from "./PersonAddTab";
import CharacterAddTab, { defaultCharacter } from "./CharacterAddTab";
import PublisherAddTab, { defaultPublisher } from "./PublisherAddTab";
import StudioAddTab, { defaultStudio } from "./StudioAddTab";
import GameAddTab, { defaultGame } from "./GameAddTab";
import GameModifyTab from "../modify-tabs/GameModifyTab";

function renderWithClient(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

// ImagePicker's own fingerprint: an "Upload" file control and a "Choose from
// library" button, in place of the old bare text input.
function expectsPicker() {
  expect(screen.getByLabelText(/upload/i)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /choose from library/i }),
  ).toBeInTheDocument();
}

describe("Add tabs render ImagePicker instead of a hand-typed storage key", () => {
  it("AnimeAddTab (Cover Image)", () => {
    renderWithClient(
      <AnimeAddTab
        franchiseCollections={{}}
        af={defaultAnime()}
        ua={() => {}}
        fillQuery=""
        setFillQuery={() => {}}
        fillOpen={false}
        setFillOpen={() => {}}
        fillRef={{ current: null }}
        fillResults={[]}
        applyAutofill={() => {}}
        allFranchises={[]}
        franchiseItems={[]}
        seriesItemsForAnime={[]}
        sources={{}}
      />,
    );
    expectsPicker();
  });

  it("PersonAddTab (Photo) — no ownerId, so attach is skipped at pick time", () => {
    renderWithClient(
      <PersonAddTab
        personForm={defaultPerson()}
        upf={() => {}}
        roles={[]}
        setRoles={() => {}}
      />,
    );
    expectsPicker();
  });

  it("CharacterAddTab (Photo)", () => {
    renderWithClient(
      <CharacterAddTab characterForm={defaultCharacter()} ucf={() => {}} />,
    );
    expectsPicker();
  });

  it("PublisherAddTab (Logo)", () => {
    renderWithClient(
      <PublisherAddTab publisherForm={defaultPublisher()} upf={() => {}} />,
    );
    expectsPicker();
  });

  it("StudioAddTab (Logo)", () => {
    renderWithClient(
      <StudioAddTab studioForm={defaultStudio()} usf={() => {}} />,
    );
    expectsPicker();
  });

  it("GameAddTab (Cover Image), no ownerId", () => {
    renderWithClient(
      <GameAddTab
        franchiseCollections={{}}
        gmf={defaultGame()}
        ugm={() => {}}
        allFranchises={[]}
        allGames={[]}
        seriesItemsForGame={[]}
        sources={{}}
        applyGameAutofill={() => {}}
      />,
    );
    expectsPicker();
  });

  it("GameModifyTab renders the same GameFormBody with an ownerId", () => {
    renderWithClient(
      <GameModifyTab
        franchiseCollections={{}}
        cgmf={defaultGame()}
        ugm={() => {}}
        allFranchises={[]}
        allGames={[]}
        seriesItemsForGame={[]}
        editingItem={{ system_id: "game-1" }}
        ribbonSection={null}
        sources={{}}
      />,
    );
    expectsPicker();
  });
});
