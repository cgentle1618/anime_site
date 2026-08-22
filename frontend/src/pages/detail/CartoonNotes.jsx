// Frontend: page component file for CartoonNotes.
import NotesTemplate from "../notes/NotesTemplate";
import SECTIONS from "../notes/configs/cartoonNotesConfig";

export default function CartoonNotes({ cartoon, isAdmin, onSave }) {
  return <NotesTemplate entity={cartoon} isAdmin={isAdmin} onSave={onSave} sections={SECTIONS} mediaType="cartoon" />;
}

