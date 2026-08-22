// Frontend: Add page tab body for Quote.
import QuoteForm from "../../components/forms/QuoteForm";
import QuoteEntryPicker from "../../components/forms/QuoteEntryPicker";
import { SectionHeader } from "../../components/forms/FormField";

export default function QuoteAddTab({ qf, uq }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <SectionHeader icon="fa-link" title="Attached Entry" />
      <QuoteEntryPicker
        mediaType={qf.media_type}
        entryId={qf.entry_id}
        onChange={(mediaType, entryId) =>
          uq({ media_type: mediaType, entry_id: entryId })
        }
      />

      <SectionHeader icon="fa-quote-left" title="Quote" />
      <QuoteForm val={qf} setVal={(next) => uq(next)} />
    </div>
  );
}
