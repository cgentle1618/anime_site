// Frontend: page component file for AnimeNotes.
import NotesTemplate from "../notes/NotesTemplate";
import SECTIONS from "../notes/configs/animeNotesConfig";

export default function AnimeNotes({ anime, isAdmin, onSave }) {
  return <NotesTemplate entity={anime} isAdmin={isAdmin} onSave={onSave} sections={SECTIONS} />;
}

