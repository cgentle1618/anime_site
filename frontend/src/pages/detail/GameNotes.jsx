// Frontend: page component file for GameNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function GameNotes({ game, isAdmin, hideSections }) {
  return (
    <NotesTemplate
      ownerType="game"
      ownerId={game.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
    />
  );
}
