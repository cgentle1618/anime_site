// Frontend: page component file for AnimeNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function AnimeNotes({ anime, isAdmin }) {
  return (
    <NotesTemplate
      ownerType="anime"
      ownerId={anime.system_id}
      isAdmin={isAdmin}
    />
  );
}
