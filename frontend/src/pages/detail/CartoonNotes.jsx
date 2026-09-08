// Frontend: page component file for CartoonNotes.
import NotesTemplate from "../notes/NotesTemplate";

export default function CartoonNotes({ cartoon, isAdmin, hideSections }) {
  return (
    <NotesTemplate
      ownerType="cartoon"
      ownerId={cartoon.system_id}
      isAdmin={isAdmin}
      hideSections={hideSections}
    />
  );
}
