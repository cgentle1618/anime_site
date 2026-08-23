// Frontend: page component file for NovelNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function NovelNotes({ novel, isAdmin, hideSections }) {
  return (
    <NotesTemplate
      ownerType="novel"
      ownerId={novel.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
    />
  );
}
