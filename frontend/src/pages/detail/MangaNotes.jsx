// Frontend: page component file for MangaNotes.
import NotesTemplate from "../notes/NotesTemplate";
import SECTIONS from "../notes/configs/mangaNotesConfig";

export default function MangaNotes({ manga, isAdmin, onSave }) {
  return <NotesTemplate entity={manga} isAdmin={isAdmin} onSave={onSave} sections={SECTIONS} />;
}

