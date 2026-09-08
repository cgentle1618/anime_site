// Frontend: Add page tab body for Meme.
import MemeForm from "../../components/forms/MemeForm";
import MemeOwnerPicker from "../../components/forms/MemeOwnerPicker";
import { SectionHeader } from "../../components/forms/FormField";

export default function MemeAddTab({ mf, um }) {
  return (
    <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-5">
      <SectionHeader icon="fa-link" title="Owner" />
      <MemeOwnerPicker
        ownerType={mf.owner_type}
        ownerId={mf.owner_id}
        onChange={(ownerType, ownerId) =>
          um({ owner_type: ownerType, owner_id: ownerId })
        }
      />

      <SectionHeader icon="fa-face-grin-squint" title="Meme" />
      <MemeForm
        val={mf}
        setVal={(next) => um(next)}
        ownerType={mf.owner_type}
        ownerId={mf.owner_id}
      />
    </div>
  );
}
