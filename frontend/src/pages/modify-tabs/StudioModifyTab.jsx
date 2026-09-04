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
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [studioForm, setStudioForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: studios = [], isLoading } = useQuery({
    queryKey: ["studios-admin"],
    queryFn: () => fetchJson(endpoints.studio.list()),
    staleTime: 10_000,
  });

  const usf = (k, v) => setStudioForm((p) => ({ ...p, [k]: v }));

  // Searches all four name fields, not just whichever one display_name_field
  // currently points at - an admin looking a studio up by its Japanese name
  // must find it even when English is the configured display name.
  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = cleanString(search);
    return studios
      .filter((s) =>
        STUDIO_NAME_FIELDS.some(
          ({ field }) => s[field] && cleanString(s[field]).includes(q),
        ),
      )
      .slice(0, 10);
  }, [studios, search]);

  async function selectStudio(studio) {
    setOpen(false);
    setSearch(displayStudioName(studio) || studio.display_name || "");
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
    setSearch("");
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
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-4 relative">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-sm"></i>
            <input
              className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Search studios to modify..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
              }}
              onFocus={() => search && setOpen(true)}
            />
          </div>
          {open && filtered.length > 0 && (
            <div className="absolute z-50 left-4 right-4 mt-1 bg-surface border border-border rounded-xl shadow-xl max-h-64 overflow-y-auto">
              {filtered.map((s) => (
                <div
                  key={s.system_id}
                  className="px-4 py-2.5 hover:bg-brand/10 cursor-pointer"
                  onMouseDown={() => selectStudio(s)}
                >
                  <div className="font-bold text-text text-sm">
                    {s.display_name || displayStudioName(s)}
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {s.credit_count} credit{s.credit_count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isLoading && studios.length === 0 && (
            <p className="text-sm text-text-faint italic mt-2">
              No studios yet.
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
