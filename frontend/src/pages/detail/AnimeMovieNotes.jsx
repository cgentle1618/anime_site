// Frontend: page component file for AnimeMovieNotes.
import NotesTemplate from "../notes/NotesTemplate";
import SECTIONS from "../notes/configs/animeMovieNotesConfig";

export default function AnimeMovieNotes({ movie, isAdmin, onSave }) {
  return <NotesTemplate entity={movie} isAdmin={isAdmin} onSave={onSave} sections={SECTIONS} />;
}

