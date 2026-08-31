// Frontend: page component file for CollectionPage.
//
// The Collection hub. Same shape as the Franchise and Series hubs - cover with
// spine strip, identity block, two-group tab bar, section slips - but a
// collection groups franchises rather than media entries, so its contents
// group holds the one "Franchises" tab instead of a tab per media type, and
// there are no status filters or roll-up statistics. Clicking a member card
// lands on the normal Franchise hub.
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { buildUrl } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  getDisplayName,
  getNamingFields,
  getSortName,
  FALLBACK_SVG,
} from "../../utils/media";
import {
  MY_RATINGS,
  FRANCHISE_EXPECTATIONS,
} from "../../config/fieldOptions";
import { getFranchiseCover, getCollectionCover } from "../../lib/covers";
import RelationGraph from "../../components/relations/RelationGraph";
import {
  HubShell,
  GRID_CLS,
  SELECT_CLS,
  Crumbs,
  AdminStrip,
  HeroCover,
  Field,
  HubTabs,
  Section,
} from "../../components/hub/HubChrome";
import { HubLoading, HubError } from "../../components/hub/HubStates";
import {
  Eyebrow,
  Slip,
  RatingStamp,
  Chip,
  Button,
} from "../../components/ui/primitives";
import FranchiseCard from "../../components/cards/FranchiseCard";
import RemarkModal from "../../components/modals/RemarkModal";
import WatchOrderSection from "../../components/tracker/WatchOrderSection";
import CollectionNotes from "./CollectionNotes";

export default function CollectionPage() {
  const { system_id } = useParams();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [collection, setCollection] = useState(null);
  const [members, setMembers] = useState([]);
  const [allEntriesDict, setAllEntriesDict] = useState({});
  const [allEntriesByFranchise, setAllEntriesByFranchise] = useState({});
  const [remarkDraft, setRemarkDraft] = useState("");
  const [activeTab, setActiveTab] = useState("Franchises");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRemark, setShowRemark] = useState(false);
  const [remarkClipped, setRemarkClipped] = useState(false);
  const remarkRef = useRef(null);

  // The inline box stays a fixed three rows; "Show all" is only worth offering
  // when the text actually runs past it.
  useEffect(() => {
    const el = remarkRef.current;
    if (!el) {
      setRemarkClipped(false);
      return;
    }
    setRemarkClipped(el.scrollHeight > el.clientHeight + 1);
  }, [remarkDraft, loading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const responses = await Promise.all([
          fetch(endpoints.resource("collection").detail(system_id), {
            credentials: "include",
          }),
          fetch(
            buildUrl(endpoints.resource("franchise").list(), {
              collection_id: system_id,
              limit: 2000,
            }),
            { credentials: "include" },
          ),
          fetch("/api/anime/?limit=2000", { credentials: "include" }),
          fetch("/api/anime-movie/?limit=2000", { credentials: "include" }),
          fetch("/api/movies/?limit=2000", { credentials: "include" }),
          fetch("/api/tv-shows/?limit=2000", { credentials: "include" }),
          fetch("/api/cartoon/?limit=2000", { credentials: "include" }),
          fetch("/api/manga/?limit=2000", { credentials: "include" }),
          fetch("/api/novel/?limit=2000", { credentials: "include" }),
          fetch("/api/comic/?limit=2000", { credentials: "include" }),
        ]);

        if (responses[0].status === 404) throw new Error("Collection not found");
        if (responses.some((r) => !r.ok)) throw new Error("Failed to load data");

        const [
          collectionData,
          franchises,
          anime,
          animeMovies,
          movies,
          tvShows,
          cartoons,
          mangas,
          novels,
          comics,
        ] = await Promise.all(responses.map((r) => r.json()));

        const allEntries = [
          ...anime,
          ...animeMovies,
          ...movies,
          ...tvShows,
          ...cartoons,
          ...mangas,
          ...novels,
          ...comics,
        ];

        if (cancelled) return;
        setCollection(collectionData);
        setRemarkDraft(collectionData.remark || "");
        setMembers(franchises);
        setAllEntriesDict(
          Object.fromEntries(allEntries.map((e) => [e.system_id, e])),
        );

        const byFranchise = {};
        for (const e of allEntries) {
          if (!e.franchise_id) continue;
          if (!byFranchise[e.franchise_id]) byFranchise[e.franchise_id] = [];
          byFranchise[e.franchise_id].push(e);
        }
        setAllEntriesByFranchise(byFranchise);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [system_id]);

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        getSortName(a, "franchise").localeCompare(getSortName(b, "franchise")),
      ),
    [members],
  );

  async function saveField(field, value) {
    try {
      const res = await fetch(
        endpoints.resource("collection").patch(system_id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value === "" ? null : value }),
          credentials: "include",
        },
      );
      if (res.ok) {
        setCollection(await res.json());
        showToast("success", "Collection updated successfully");
      } else {
        showToast("error", "Save failed");
      }
    } catch {
      showToast("error", "Network error. Reverting.");
    }
  }

  // Shared by the inline box and the full-view modal, which edit one draft.
  function saveRemark() {
    if (isAdmin && remarkDraft !== (collection?.remark || ""))
      saveField("remark", remarkDraft);
  }

  if (loading) return <HubLoading label="Loading collection..." />;

  if (error || !collection)
    return (
      <HubError
        title="Error loading collection"
        message={error || "Collection not found"}
        backTo="/library/collection"
        backLabel="Collection library"
      />
    );

  // The collection has no cover of its own: the shared helper borrows one from
  // its chosen (or first usable) member franchise.
  const coverUrl = getCollectionCover(
    collection,
    sortedMembers,
    allEntriesDict,
    allEntriesByFranchise,
  );

  const name = getDisplayName(collection, "collection") || "Unknown Collection";
  const altNames = getNamingFields(collection, "collection").filter(
    (f) => f.value && f.value !== name,
  );

  const eyebrow = [
    "Collection",
    `${members.length} ${members.length === 1 ? "franchise" : "franchises"}`,
  ].join("  ·  ");

  return (
    <HubShell>
      <Crumbs
        trail={[{ to: "/library/collection", label: "Collection" }]}
        current={name}
      />

      {isAdmin && <AdminStrip editId={collection.system_id} />}

      {/* Hero: cover with spine strip, then the identity block */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <HeroCover
            src={coverUrl}
            spine="Collection"
            id={collection.system_id}
            rating={collection.my_rating}
          />
        </div>

        <div className="lg:col-span-3 space-y-6">
          <header>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
              {eyebrow}
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
              {name}
            </h1>
            {altNames.length > 0 && (
              <div className="space-y-0.5 mb-4">
                {altNames.map((f) => (
                  <p
                    key={f.label}
                    className="text-lg text-text-muted truncate flex items-baseline gap-2"
                  >
                    <Eyebrow className="shrink-0">{f.label}</Eyebrow>
                    {f.value}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm pt-3 border-t border-border">
              <div className="flex items-baseline gap-2">
                <Eyebrow>Franchises</Eyebrow>
                <span className="text-text">{members.length}</span>
              </div>
            </div>

            {/* Same chip vocabulary as the Franchise hub, so an expectation
                reads the same wherever it turns up. */}
            {collection.collection_expectation && (
              <div className="flex flex-wrap gap-2 mt-4">
                <Chip>Expectation · {collection.collection_expectation}</Chip>
              </div>
            )}
          </header>

          {isAdmin && (
            <Slip title="Curation">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Overall rating">
                  <select
                    value={collection.my_rating || ""}
                    onChange={(e) => saveField("my_rating", e.target.value)}
                    className={`${SELECT_CLS} w-full`}
                  >
                    <option value="">Not rated</option>
                    {MY_RATINGS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Expectation">
                  <select
                    value={collection.collection_expectation || ""}
                    onChange={(e) =>
                      saveField("collection_expectation", e.target.value)
                    }
                    className={`${SELECT_CLS} w-full`}
                  >
                    <option value="">None</option>
                    {FRANCHISE_EXPECTATIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Slip>
          )}

          {(isAdmin || collection.remark) && (
            <Slip
              title="Remark"
              actions={
                remarkClipped && (
                  <Button
                    kind="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setShowRemark(true)}
                  >
                    Show all
                  </Button>
                )
              }
            >
              <textarea
                ref={remarkRef}
                value={remarkDraft}
                disabled={!isAdmin}
                onChange={(e) => setRemarkDraft(e.target.value)}
                onBlur={() => saveRemark()}
                rows={3}
                className={`w-full border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none transition ${isAdmin ? "border-border bg-surface text-text" : "border-border bg-surface-2 text-text-muted cursor-default"}`}
              />
            </Slip>
          )}
        </div>
      </div>

      {/*
        Same two-group bar as the other two hubs. The contents group is
        "Members" rather than "Media" and holds a single tab, because a
        collection groups franchises instead of media entries.
      */}
      <HubTabs
        groups={[
          { label: "Members", tabs: ["Franchises"], counted: true },
          { label: "Extras", tabs: ["Watch Order", "Relations", "Notes"] },
        ]}
        activeTab={activeTab}
        onSelect={setActiveTab}
        getCount={() => sortedMembers.length}
      />

      {activeTab === "Franchises" && (
        <Section
          title="Franchises"
          subtitle="Franchises grouped under this collection"
          count={sortedMembers.length}
        >
          {sortedMembers.length === 0 ? (
            <div className="border border-dashed border-border-strong px-4 py-6 text-center">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-1">
                No franchises
              </div>
              <p className="text-sm text-text-faint">
                Nothing is filed under this collection yet. Assign one from the
                Franchise tab on the Modify page.
              </p>
            </div>
          ) : (
            <div className={GRID_CLS}>
              {sortedMembers.map((franchise) => (
                <FranchiseCard
                  key={franchise.system_id}
                  franchise={franchise}
                  coverUrl={getFranchiseCover(
                    franchise,
                    allEntriesDict,
                    allEntriesByFranchise,
                  )}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {activeTab === "Watch Order" && (
        <Section
          title="Watch order"
          subtitle="Cross-franchise orders covering this collection"
        >
          <WatchOrderSection collectionId={system_id} />
        </Section>
      )}

      {/*
        Owned by the collection itself. Memes live inside it: the section
        registry gives `memes` to every owner, so the Notes tab renders them
        alongside the rest.
      */}
      {/* ── Relations tab content ────────────────────────────────────────── */}
      {activeTab === "Relations" && (
        <Section
          title="Relations"
          subtitle="How this collection's entries connect - prequels, alternatives, side stories and adaptations"
        >
          {/* Read-only everywhere outside the admin Relations page, for admins
              too: this is a view of the structure, and curating it belongs in
              one place rather than scattered across every hub. */}
          <RelationGraph readOnly scopeType="collection" scopeId={system_id} />
        </Section>
      )}

      {activeTab === "Notes" && (
        <Section
          title="Notes"
          subtitle="Structured notes belonging to the whole collection"
        >
          {/* The hero remark editor above edits the same singleton note row, so
              hide the duplicate `remark` section wherever that editor renders. */}
          <CollectionNotes
            collection={collection}
            isAdmin={isAdmin}
            hideSections={isAdmin || collection.remark ? ["remark"] : []}
          />
        </Section>
      )}

      {showRemark && (
        <RemarkModal
          value={remarkDraft}
          isAdmin={isAdmin}
          onChange={setRemarkDraft}
          onClose={() => {
            saveRemark();
            setShowRemark(false);
          }}
        />
      )}
    </HubShell>
  );
}
