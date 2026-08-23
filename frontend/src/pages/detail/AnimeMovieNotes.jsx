// Frontend: page component file for AnimeMovieNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function AnimeMovieNotes({ movie, isAdmin }) {
  return (
    <NotesTemplate
      ownerType="anime-movie"
      ownerId={movie.system_id}
      isAdmin={isAdmin}
    />
  );
}
