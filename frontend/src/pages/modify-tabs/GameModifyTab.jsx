// Frontend: modify tab page file for GameModifyTab.
//
// The comic pair keeps two near-identical copies of the same fields; this one
// does not. GameAddTab exports its field body and lineage pickers, so the two
// tabs share one definition and cannot drift — the only real difference is
// the ribbon section Modify renders above the form.
import { SectionHeader } from "../../components/forms/FormField";
import { GameFormBody, GameLineageFields } from "../add-tabs/GameAddTab";

export default function GameModifyTab({
  franchiseCollections,
  cgmf,
  ugm,
  allFranchises,
  allGames,
  seriesItemsForGame,
  editingItem,
  ribbonSection,
  sources,
}) {
  return (
    <>
      {ribbonSection}

      <SectionHeader icon="fa-gamepad" title="Titles & Naming" />
      <GameLineageFields
        f={cgmf}
        u={ugm}
        allFranchises={allFranchises}
        seriesItemsForGame={seriesItemsForGame}
        franchiseCollections={franchiseCollections}
      />
      <GameFormBody
        f={cgmf}
        u={ugm}
        allGames={allGames}
        excludeGameId={editingItem?.system_id}
        sources={sources}
      />
    </>
  );
}
