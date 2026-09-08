// Frontend: modify tab page file for SeriesModifyTab.
import { useEffect, useState } from "react";
import { getDisplayName } from "../../utils/media";
import { releaseYear } from "../../lib/releaseDate";
import ComboBox from "../../components/forms/ComboBox";
import {
  CollectionNote,
  Field,
  SectionHeader,
  inputCls,
  selectCls,
} from "../../components/forms/FormField";
import SizeGroupControls from "../../components/plan/SizeGroupControls";
import PlanKindToggles, {
  kindLabel,
  applicableTypes,
} from "../../components/plan/PlanKindToggles";
import { scopesFor } from "../../config/planNextGroups";
import {
  MY_RATINGS,
  FRANCHISE_EXPECTATIONS,
} from "../../config/fieldOptions";

function getEntryYear(e) {
  const d =
    e.release_date_jp ||
    e.release_date_tw ||
    e.release_date_usa ||
    e.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

export default function SeriesModifyTab({
  sf,
  us,
  franchiseItems,
  franchiseCollections,
  allAnime,
  allMovies,
  allTvShows,
  allCartoons,
  allMangas,
  allNovels,
  allComics,
  editingItem,
}) {
  const seriesId = editingItem?.system_id;

  // ── plan-next: which media types this series is queued for ──────────────
  const [plannedTypes, setPlannedTypes] = useState(new Set());
  const [rewatchMarked, setRewatchMarked] = useState(new Set());

  useEffect(() => {
    if (!seriesId) {
      setPlannedTypes(new Set());
      setRewatchMarked(new Set());
      return;
    }
    let cancelled = false;
    fetch("/api/plan-next/?scope=series", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (cancelled) return;
        setPlannedTypes(
          new Set(
            rows
              .filter(
                (r) => r.target_id === seriesId && (r.kind ?? "next") === "next",
              )
              .map((r) => r.media_type),
          ),
        );
        setRewatchMarked(
          new Set(
            rows
              .filter((r) => r.target_id === seriesId && r.kind === "rewatch")
              .map((r) => r.media_type),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setPlannedTypes(new Set());
          setRewatchMarked(new Set());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  const sizeGroupMediaTypes = Array.from(
    new Set([
      ...Object.keys(sf.size_group_derived || editingItem?.size_group_derived || {}),
      ...Object.keys(sf.size_group_manual || {}),
    ]),
  ).filter((mt) => scopesFor("next", mt).includes("series"));
  if (sizeGroupMediaTypes.length === 0) sizeGroupMediaTypes.push("anime");

  // Shared by both plan kinds: only the kind and the target state Set differ.
  async function handleTogglePlanKind(kind, mediaType, next) {
    if (!seriesId) return;
    try {
      if (next) {
        const res = await fetch("/api/plan-next/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            media_type: mediaType,
            scope: "series",
            kind,
            target_id: seriesId,
          }),
        });
        if (!res.ok && res.status !== 409) return;
      } else {
        const params = new URLSearchParams({
          scope: "series",
          media_type: mediaType,
          kind,
          target_id: seriesId,
        });
        const res = await fetch(`/api/plan-next/target?${params}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok && res.status !== 404) return;
      }
      const setter = kind === "rewatch" ? setRewatchMarked : setPlannedTypes;
      setter((prev) => {
        const nextSet = new Set(prev);
        if (next) nextSet.add(mediaType);
        else nextSet.delete(mediaType);
        return nextSet;
      });
    } catch {
      // Network error - leave the checkbox state untouched.
    }
  }

  const handleTogglePlan = (mediaType, next) =>
    handleTogglePlanKind("next", mediaType, next);
  const handleRewatchToggle = (mediaType, next) =>
    handleTogglePlanKind("rewatch", mediaType, next);

  function handleOverride(mediaType, key) {
    const nextManual = { ...(sf.size_group_manual || {}) };
    if (key) nextManual[mediaType] = key;
    else delete nextManual[mediaType];
    us(
      "size_group_manual",
      Object.keys(nextManual).length > 0 ? nextManual : null,
    );
  }

  // anime_movies is absent on purpose: that table has no series_id column, so
  // no anime movie can ever belong to a series.
  const seriesEntries = [
    ...(allAnime || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "anime" })),
    ...(allMovies || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "movie" })),
    ...(allTvShows || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "tv-show" })),
    ...(allCartoons || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "cartoon" })),
    ...(allMangas || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "manga" })),
    ...(allNovels || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "novel" })),
    ...(allComics || [])
      .filter((e) => e.series_id === seriesId)
      .map((e) => ({ ...e, _type: "comic" })),
  ].sort((a, b) => getEntryYear(b) - getEntryYear(a));

  // Media types this series actually holds entries for, keyed the way
  // scopesFor/PlanKindToggles expect. anime_movies is absent for the same
  // reason it is absent from seriesEntries above.
  const seriesMediaTypes = Array.from(
    new Set(seriesEntries.map((e) => e._type)),
  );

  const seriesApplicableRewatchTypes = applicableTypes(
    "rewatch",
    "series",
    seriesMediaTypes,
  );

  function entryOptionLabel(e) {
    const name = getDisplayName(e, e._type);
    const yr = releaseYear(
      e.release_date_jp || e.release_date_tw || e.release_date_usa || e.release_date,
    );
    return `${name}${yr ? ` (${yr})` : ""} [${e._type}]`;
  }

  return (
    <>
      <SectionHeader icon="fa-layer-group" title="Titles & Naming" />
      <Field label="Parent Franchise" required>
        <ComboBox
          items={franchiseItems}
          selectedId={sf.franchise_id}
          inputText={sf.franchise_text}
          onSelect={(id, label) => {
            us("franchise_id", id);
            us("franchise_text", label);
          }}
          onType={(text) => {
            us("franchise_text", text);
            us("franchise_id", null);
          }}
          onClear={() => {
            us("franchise_id", null);
            us("franchise_text", "");
          }}
          placeholder="Search or type new franchise..."
          allowNew
        />
        <CollectionNote
          franchiseId={sf.franchise_id}
          franchiseCollections={franchiseCollections}
        />
      </Field>
      <Field label="Series Name EN">
        <input
          className={inputCls}
          value={sf.series_name_en}
          onChange={(e) => us("series_name_en", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Series Name CN">
          <input
            className={inputCls}
            value={sf.series_name_cn}
            onChange={(e) => us("series_name_cn", e.target.value)}
          />
        </Field>
        <Field label="Series Name roman">
          <input
            className={inputCls}
            value={sf.series_name_roman}
            onChange={(e) => us("series_name_roman", e.target.value)}
          />
        </Field>
        <Field label="Series Name JP">
          <input
            className={inputCls}
            value={sf.series_name_jp}
            onChange={(e) => us("series_name_jp", e.target.value)}
          />
        </Field>
        <Field label="Series Name Alt">
          <input
            className={inputCls}
            value={sf.series_name_alt}
            onChange={(e) => us("series_name_alt", e.target.value)}
          />
        </Field>
      </div>
      <SectionHeader icon="fa-info-circle" title="Other Information" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="My Rating">
          <select
            className={selectCls}
            value={sf.my_rating}
            onChange={(e) => us("my_rating", e.target.value)}
          >
            <option value="">—</option>
            {MY_RATINGS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expectation">
          <select
            className={selectCls}
            value={sf.series_expectation}
            onChange={(e) => us("series_expectation", e.target.value)}
          >
            <option value="">—</option>
            {FRANCHISE_EXPECTATIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <SectionHeader icon="fa-image" title="Cover Images" />
      <Field
        label="Main Cover"
        hint="Series hub cover — leave blank to auto-pick latest entry with cover"
      >
        <select
          className={selectCls}
          value={sf.cover_entry_id || ""}
          onChange={(e) => us("cover_entry_id", e.target.value || null)}
        >
          <option value="">— Auto (latest with cover) —</option>
          {seriesEntries.map((e) => (
            <option key={e.system_id} value={e.system_id}>
              {entryOptionLabel(e)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Plan Next"
        hint="Queue this series per media type, and override its derived size bucket"
      >
        <SizeGroupControls
          mediaTypes={sizeGroupMediaTypes}
          planned={plannedTypes}
          derived={sf.size_group_derived || editingItem?.size_group_derived}
          manual={sf.size_group_manual}
          onTogglePlan={handleTogglePlan}
          onOverride={handleOverride}
        />
      </Field>
      {seriesApplicableRewatchTypes.length > 0 && (
        <Field label={kindLabel("rewatch", seriesApplicableRewatchTypes)}>
          <PlanKindToggles
            kind="rewatch"
            scope="series"
            mediaTypes={seriesMediaTypes}
            marked={rewatchMarked}
            onToggle={handleRewatchToggle}
          />
        </Field>
      )}
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          value={sf.remark}
          onChange={(e) => us("remark", e.target.value)}
        />
      </Field>
    </>
  );
}
