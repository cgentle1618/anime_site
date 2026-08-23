// Frontend: page component file for MangaNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function MangaNotes({ manga, isAdmin, hideSections }) {
  return (
    <NotesTemplate
      ownerType="manga"
      ownerId={manga.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
    />
  );
}
