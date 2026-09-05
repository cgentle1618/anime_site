// Frontend: modify tab page file for StudioModifyTab.
//
// Self-contained, like QuoteManageTab/MemeManageTab: owns its own fetch,
// picker and save state instead of hooking into Modify.jsx's per-type
// form/search/save machinery (which is built around the media-entry and
// collection/franchise/series shapes, not a public entity like Studio).
// Reuses StudioFields from StudioAddTab so the input markup isn't
// duplicated - see the comment on that export.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StudioFields } from "../add-tabs/StudioAddTab";
import { endpoints } from "../../api/endpoints";
import { fetchJson, jsonBody } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { STUDIO_NAME_FIELDS, displayStudioName } from "../../lib/naming";

function cleanString(str) {
  return (str || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function studioLabel(s) {
  return s.display_name || displayStudioName(s) || "";
}

function studioToForm(s) {
  return {
    name_en: s.name_en || "",
    name_cn: s.name_cn || "",
    name_jp: s.name_jp || "",
    name_alt: s.name_alt || "",
    display_name_field: s.display_name_field || "",
    my_rating: s.my_rating || "",
    logo_file: s.logo_file || "",
    country: s.country || "",
    website_url: s.website_url || "",
    founded_date: s.founded_date || "",
    defunct_date: s.defunct_date || "",
    mal_id: s.mal_id ?? "",
    mal_link: s.mal_link || "",
    remark: s.remark || "",
  };
}

export default function StudioModifyTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [studioForm, setStudioForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: studios = [], isLoading } = useQuery({
    queryKey: ["studios-admin"],
    queryFn: () => fetchJson(endpoints.studio.list()),
    staleTime: 10_000,
  });

  const usf = (k, v) => setStudioForm((p) => ({ ...p, [k]: v }));

  // Every studio is listed up front, the way the System Option tab lists a
  // category's values - an admin should not have to already know the name to
  // reach the record. The search box filters that grid in place, across all
  // four name fields rather than just whichever one display_name_field points
  // at: looking a studio up by its Japanese name must work even when English
  // is the configured display name.
  const filtered = useMemo(() => {
    const q = cleanString(search);
    const matched = q
      ? studios.filter((s) =>
          STUDIO_NAME_FIELDS.some(
            ({ field }) => s[field] && cleanString(s[field]).includes(q),
          ),
        )
      : studios;
    return [...matched].sort((a, b) =>
      studioLabel(a).localeCompare(studioLabel(b)),
    );
  }, [studios, search]);

  async function selectStudio(studio) {
    try {
      const fresh = await fetchJson(
        endpoints.studio.detail(studio.system_id),
      );
      setSelectedId(fresh.system_id);
      setStudioForm(studioToForm(fresh));
    } catch {
      showToast("error", "Failed to load studio.");
    }
  }

  function closeEditor() {
    setSelectedId(null);
    setStudioForm(null);
  }

  const hasAnyName = studioForm
    ? STUDIO_NAME_FIELDS.some(({ field }) => studioForm[field]?.trim())
    : false;

  async function handleSave(e) {
    e.preventDefault();
    if (submitting || !selectedId || !hasAnyName) return;
    setSubmitting(true);
    try {
      const updated = await fetchJson(endpoints.studio.update(selectedId), {
        method: "PUT",
        ...jsonBody({
          name_en: studioForm.name_en.trim() || null,
          name_cn: studioForm.name_cn.trim() || null,
          name_jp: studioForm.name_jp.trim() || null,
          name_alt: studioForm.name_alt.trim() || null,
          display_name_field: studioForm.display_name_field || null,
          my_rating: studioForm.my_rating || null,
          logo_file: studioForm.logo_file || null,
          country: studioForm.country || null,
          website_url: studioForm.website_url || null,
          founded_date: studioForm.founded_date || null,
          defunct_date: studioForm.defunct_date || null,
          mal_id: studioForm.mal_id ? parseInt(studioForm.mal_id, 10) : null,
          mal_link: studioForm.mal_link || null,
          remark: studioForm.remark || null,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["studios-admin"] });
      setStudioForm(studioToForm(updated));
      showToast("success", "Studio updated.");
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
                placeholder="Search studios to modify..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filtered.map((s) => (
                <button
                  key={s.system_id}
                  type="button"
                  onClick={() => selectStudio(s)}
                  className="text-left px-3 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium text-text-muted hover:border-brand hover:text-brand hover:bg-brand-soft transition shadow-sm truncate"
                >
                  {studioLabel(s)}
                </button>
              ))}
            </div>
          )}

          {!isLoading && studios.length === 0 && (
            <p className="text-sm text-text-faint italic">No studios yet.</p>
          )}
          {!isLoading && studios.length > 0 && filtered.length === 0 && (
            <p className="text-sm text-text-faint italic">
              No studio matches that name.
            </p>
          )}
        </div>
      )}

      {selectedId && studioForm && (
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
            <StudioFields studioForm={studioForm} usf={usf} />
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
