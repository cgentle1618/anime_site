// Frontend: the Notes tab for a series. A series-level note is the same row
// shape as an entry's - only owner_type differs - so this is the same
// component with a different owner.
import NotesTemplate from "../notes/NotesTemplate";

export default function SeriesNotes({ series, isAdmin }) {
  return (
    <NotesTemplate
      ownerType="series"
      ownerId={series.system_id}
      isAdmin={isAdmin}
    />
  );
}
