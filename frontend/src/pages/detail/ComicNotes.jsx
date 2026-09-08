// Frontend: page component file for ComicNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function ComicNotes({ comic, isAdmin, hideSections }) {
  return (
    <NotesTemplate
      ownerType="comic"
      ownerId={comic.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
    />
  );
}
