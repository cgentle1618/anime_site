// Frontend: page component file for NovelNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function NovelNotes({ novel, isAdmin }) {
  return (
    <NotesTemplate
      ownerType="novel"
      ownerId={novel.system_id}
      isAdmin={isAdmin}
    />
  );
}
