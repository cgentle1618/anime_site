// Frontend: page component file for NovelNotes.
import NotesTemplate from "./notes/NotesTemplate";
import SECTIONS from "./notes/configs/novelNotesConfig";

export default function NovelNotes({ novel, isAdmin, onSave }) {
  return <NotesTemplate entity={novel} isAdmin={isAdmin} onSave={onSave} sections={SECTIONS} />;
}

