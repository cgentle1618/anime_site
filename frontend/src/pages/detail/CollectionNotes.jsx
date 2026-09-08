// Frontend: the Notes tab for a collection. A collection-level note is the
// same row shape as an entry's - only owner_type differs - so this is the
// same component with a different owner.
import NotesTemplate from "../notes/NotesTemplate";

export default function CollectionNotes({ collection, isAdmin, hideSections }) {
  return (
    <NotesTemplate
      ownerType="collection"
      ownerId={collection.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
    />
  );
}
