// Frontend: modify tab page file for PublisherModifyTab.
//
// The publisher twin of StudioModifyTab.jsx: self-contained, owning its own
// fetch, picker and save state instead of hooking into Modify.jsx's per-type
// form/search/save machinery (built around the media-entry and
// collection/franchise/series shapes, not a public entity). Reuses
// PublisherFields from PublisherAddTab so the input markup isn't duplicated.
//
// Two divergences from the studio tab: no MAL columns (a publisher has no MAL
// record), and no country seeding — nearly every studio here is Japanese, but
// a publisher is as likely to be American, so an empty country stays empty.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PublisherFields } from "../add-tabs/PublisherAddTab";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { STUDIO_NAME_FIELDS, displayStudioName } from "../../lib/naming";

function cleanString(str) {
  return (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function publisherLabel(p) {
  return p.display_name || displayStudioName(p) || "";
}

function publisherToForm(p) {
  return {
    name_en: p.name_en || "",
    name_cn: p.name_cn || "",
    name_jp: p.name_jp || "",
    name_alt: p.name_alt || "",
    display_name_field: p.display_name_field || "",
    my_rating: p.my_rating || "",
    logo_file: p.logo_file || "",
    country: p.country || "",
    website_url: p.website_url || "",
    founded_date: p.founded_date || "",
    defunct_date: p.defunct_date || "",
    remark: p.remark || "",
    // PUT replaces the scope set wholesale, so the form has to hold the
    // current one - omitting it on save would clear every media type the
    // publisher is offered on.
    scopes: p.scopes || [],
  };
}

export default function PublisherModifyTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [publisherForm, setPublisherForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: publishers = [], isLoading } = useQuery({
    queryKey: ["publishers-admin"],
    queryFn: () => fetchJson(endpoints.publisher.list()),
    staleTime: 10_000,
  });

  const upf = (k, v) => setPublisherForm((p) => ({ ...p, [k]: v }));

  // Every publisher is listed up front - an admin should not have to already
  // know the name to reach the record. The search box filters that grid in
  // place, across all four name fields rather than just whichever one
  // display_name_field points at: looking a distributor up by its English
  // name must work even when Chinese is the configured display name.
  const filtered = useMemo(() => {
    const q = cleanString(search);
    const matched = q
      ? publishers.filter((p) =>
          STUDIO_NAME_FIELDS.some(
            ({ field }) => p[field] && cleanString(p[field]).includes(q),
          ),
        )
      : publishers;
    return [...matched].sort((a, b) =>
      publisherLabel(a).localeCompare(publisherLabel(b)),
    );
  }, [publishers, search]);

  async function selectPublisher(publisher) {
    try {
      const fresh = await fetchJson(
        endpoints.publisher.detail(publisher.system_id),
      );
      setSelectedId(fresh.system_id);
      setPublisherForm(publisherToForm(fresh));
    } catch {
      showToast("error", "Failed to load publisher.");
    }
  }

  function closeEditor() {
    setSelectedId(null);
    setPublisherForm(null);
  }

  const hasAnyName = publisherForm
    ? STUDIO_NAME_FIELDS.some(({ field }) => publisherForm[field]?.trim())
    : false;

  async function handleSave(e) {
    e.preventDefault();
    if (submitting || !selectedId || !hasAnyName) return;
    setSubmitting(true);
    try {
      const updated = await fetchJson(endpoints.publisher.update(selectedId), {
        method: "PUT",
        ...jsonBody({
          name_en: publisherForm.name_en.trim() || null,
          name_cn: publisherForm.name_cn.trim() || null,
          name_jp: publisherForm.name_jp.trim() || null,
          name_alt: publisherForm.name_alt.trim() || null,
          display_name_field: publisherForm.display_name_field || null,
          my_rating: publisherForm.my_rating || null,
          logo_file: publisherForm.logo_file || null,
          country: publisherForm.country || null,
          website_url: publisherForm.website_url || null,
          founded_date: publisherForm.founded_date || null,
          defunct_date: publisherForm.defunct_date || null,
          remark: publisherForm.remark || null,
          scopes: publisherForm.scopes || [],
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["publishers-admin"] });
      setPublisherForm(publisherToForm(updated));
      // Back to the top: the toast renders at the top of the page and the
      // form is long enough to have scrolled it out of sight.
      window.scrollTo(0, 0);
      showToast("success", "Publisher updated.");
    } catch (err) {
      showToast("error", err.message || "Update failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!selectedId && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-4">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-sm"></i>
              <input
                className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="Search publishers to modify..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filtered.map((p) => (
                <button
                  key={p.system_id}
                  type="button"
                  onClick={() => selectPublisher(p)}
                  className="text-left px-3 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium text-text-muted hover:border-brand hover:text-brand hover:bg-brand-soft transition shadow-sm truncate"
                >
                  {publisherLabel(p)}
                </button>
              ))}
            </div>
          )}

          {!isLoading && publishers.length === 0 && (
            <p className="text-sm text-text-faint italic">No publishers yet.</p>
          )}
          {!isLoading && publishers.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-text-faint italic">
              No publisher matches that name.
            </p>
          )}
        </div>
      )}

      {selectedId && publisherForm && (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-bold text-text-muted hover:bg-surface-2 transition shrink-0"
            >
              <i className="fas fa-arrow-left text-xs"></i> Back
            </button>
            <span className="font-mono text-xs text-text-faint bg-surface-2 px-2 py-1 rounded truncate">
              {selectedId}
            </span>
          </div>

          <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
            <PublisherFields
              publisherForm={publisherForm}
              upf={upf}
              ownerId={selectedId}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !hasAnyName}
              className="flex items-center gap-2 px-6 py-3 bg-brand text-on-brand rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
            >
              {submitting ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : (
                <i className="fas fa-save"></i>
              )}
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
