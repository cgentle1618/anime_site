// Frontend: page component file for MovieNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function MovieNotes({ movie, isAdmin }) {
  return (
    <NotesTemplate
      ownerType="movie"
      ownerId={movie.system_id}
      isAdmin={isAdmin}
    />
  );
}
