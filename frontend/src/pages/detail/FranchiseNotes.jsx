// Frontend: the Notes tab for a franchise. A franchise-level note is the same
// row shape as an entry's - only owner_type differs - so this is the same
// component with a different owner.
import NotesTemplate from "../notes/NotesTemplate";

export default function FranchiseNotes({ franchise, isAdmin }) {
  return (
    <NotesTemplate
      ownerType="franchise"
      ownerId={franchise.system_id}
      isAdmin={isAdmin}
    />
  );
}
