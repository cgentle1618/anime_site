// Frontend: page component file for MovieNotes.
import NotesTemplate from "../notes/NotesTemplate";
import SECTIONS from "../notes/configs/movieNotesConfig";

export default function MovieNotes({ movie, isAdmin, onSave }) {
  return <NotesTemplate entity={movie} isAdmin={isAdmin} onSave={onSave} sections={SECTIONS} />;
}

