// Frontend: the Notes tab for a series. A series-level note is the same row
// shape as an entry's - only owner_type differs - so this is the same
// component with a different owner.
//
// Not yet mounted anywhere: series has no detail/hub page (see
// app/utils/media_resolver.py), so there is nowhere to put a tab strip for
// it. This wrapper exists so mounting it is a one-line change whenever a
// series hub page is built.
import NotesTemplate from "../notes/NotesTemplate";

export default function SeriesNotes({ seriesId, isAdmin }) {
  return (
    <NotesTemplate ownerType="series" ownerId={seriesId} isAdmin={isAdmin} />
  );
}
