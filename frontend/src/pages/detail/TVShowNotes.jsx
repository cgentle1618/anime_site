// Frontend: page component file for TVShowNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function TVShowNotes({ show, isAdmin, hideSections }) {
  return (
    <NotesTemplate
      ownerType="tv-show"
      ownerId={show.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
    />
  );
}
