// Frontend: page component file for TVShowNotes.
import NotesTemplate from "./notes/NotesTemplate";
import SECTIONS from "./notes/configs/tvShowNotesConfig";

export default function TVShowNotes({ show, isAdmin, onSave }) {
  return <NotesTemplate entity={show} isAdmin={isAdmin} onSave={onSave} sections={SECTIONS} />;
}

