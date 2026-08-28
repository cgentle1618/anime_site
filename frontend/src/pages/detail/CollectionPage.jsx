// Frontend: page component file for CollectionPage.
//
// The Collection hub. Same shape as the Franchise and Series hubs - hero card,
// two-group tab bar, shared section headers - but a collection groups
// franchises rather than media entries, so its contents group holds the one
// "Franchises" tab instead of a tab per media type, and there are no status
// filters or roll-up statistics. Clicking a member card lands on the normal
// Franchise hub.
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { buildUrl } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import {
  getDisplayName,
  getNamingFields,
  getSortName,
} from "../../utils/media";
import {
  MY_RATINGS,
  FRANCHISE_EXPECTATIONS,
} from "../../config/fieldOptions";
import { getFranchiseCover, getCollectionCover } from "../../lib/covers";
import TierBadge from "../../components/layout/TierBadge";
import SectionHeader from "../../components/hub/SectionHeader";
import HubTabBar from "../../components/hub/HubTabBar";
import RelationGraph from "../../components/relations/RelationGraph";
import {
  HubShell,
  HubBreadcrumb,
  HubCard,
  HubHeroRow,
  HubCover,
  GRID_CLS,
} from "../../components/hub/HubChrome";
import {
  HubLoading,
  HubError,
  HubEmpty,
} from "../../components/hub/HubStates";
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
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
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

  if (loading) return <HubLoading label="Loading Collection Hub..." />;

  if (error || !collection)
    return (
      <HubError
        title="Error Loading Collection"
        message={error || "Collection not found"}
        backTo="/library/collection"
        backLabel="Collection Library"
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

  return (
    <HubShell>
      <HubBreadcrumb
        trail={[
          {
            to: "/library/collection",
            icon: "fa-boxes-stacked",
            label: "Collection Library",
          },
        ]}
        current={name}
        editId={collection.system_id}
        isAdmin={isAdmin}
      />

      {/* Hero */}
      <HubCard tier="collection">
        <HubHeroRow>
          <HubCover src={coverUrl} />

            <div className="flex-1 min-w-0">
              <div className="mb-2">
                <TierBadge tier="collection" />
              </div>
              <h1 className="text-2xl font-black text-gray-900 leading-tight">
                {name}
              </h1>
              {altNames.length > 0 && (
                <div className="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-3">
                  {altNames.map((f) => (
                    <span key={f.label}>{f.value}</span>
                  ))}
                </div>
              )}

              {/* Same badge vocabulary as the Franchise hub, so a rating or an
                  expectation reads the same wherever it turns up. */}
              <div className="flex flex-wrap gap-2 mt-4">
                {collection.my_rating && (
                  <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full text-xs font-bold">
                    <i className="fas fa-star mr-1"></i>
                    {collection.my_rating}
                  </span>
                )}
                {collection.collection_expectation && (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold">
                    {collection.collection_expectation} Expectation
                  </span>
                )}
                <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-xs font-bold">
                  {members.length}{" "}
                  {members.length === 1 ? "Franchise" : "Franchises"}
                </span>
              </div>
            </div>

            {/* Admin controls, labelled the way the Franchise hub labels them. */}
            {isAdmin && (
              <div className="w-full lg:w-52 shrink-0 space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Overall Rating
                  </label>
                  <select
                    value={collection.my_rating || ""}
                    onChange={(e) => saveField("my_rating", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">— Not Rated —</option>
                    {MY_RATINGS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    Expectation
                  </label>
                  <select
                    value={collection.collection_expectation || ""}
                    onChange={(e) =>
                      saveField("collection_expectation", e.target.value)
                    }
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">— None —</option>
                    {FRANCHISE_EXPECTATIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
        </HubHeroRow>

        {/* Remark */}
          {(isAdmin || collection.remark) && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Remark
                </label>
                {remarkClipped && (
                  <button
                    type="button"
                    onClick={() => setShowRemark(true)}
                    className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
                  >
                    <i className="fas fa-up-right-and-down-left-from-center text-[10px]"></i>
                    Show all
                  </button>
                )}
              </div>
              <textarea
                ref={remarkRef}
                value={remarkDraft}
                disabled={!isAdmin}
                onChange={(e) => setRemarkDraft(e.target.value)}
                onBlur={() => saveRemark()}
                rows={3}
                className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand resize-none transition ${isAdmin ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 text-gray-500 cursor-default"}`}
            />
          </div>
        )}
      </HubCard>

      {/*
        Same two-group bar as the other two hubs. The contents group is
        "Members" rather than "Media" and holds a single tab, because a
        collection groups franchises instead of media entries.
      */}
      <HubTabBar
        groups={[
          { label: "Members", tabs: ["Franchises"], counted: true },
          { label: "Extras", tabs: ["Watch Order", "Relations", "Notes"] },
        ]}
        activeTab={activeTab}
        onSelect={setActiveTab}
        getCount={() => sortedMembers.length}
      />

      {activeTab === "Franchises" && (
        <div>
          <SectionHeader
            icon="fa-sitemap"
            title="Franchises"
            subtitle="Franchises grouped under this collection"
            count={sortedMembers.length}
          />
          {sortedMembers.length === 0 ? (
            <HubEmpty
              icon="fa-sitemap"
              message="No franchises in this collection yet"
              hint="Assign one from the Franchise tab on the Modify page."
            />
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
        </div>
      )}

      {activeTab === "Watch Order" && (
        <div>
          <SectionHeader
            icon="fa-list-ol"
            title="Watch Order"
            subtitle="Cross-franchise orders covering this collection"
          />
          <WatchOrderSection collectionId={system_id} />
        </div>
      )}

      {/*
        Owned by the collection itself. Memes live inside it: the section
        registry gives `memes` to every owner, so the Notes tab renders them
        alongside the rest.
      */}
      {/* ── Relations tab content ────────────────────────────────────────── */}
      {activeTab === "Relations" && (
        <div>
          <SectionHeader
            icon="fa-diagram-project"
            title="Relations"
            subtitle="How this collection's entries connect - prequels, alternatives, side stories and adaptations"
          />
          {/* Read-only everywhere outside the admin Relations page, for admins
              too: this is a view of the structure, and curating it belongs in
              one place rather than scattered across every hub. */}
          <RelationGraph readOnly scopeType="collection" scopeId={system_id} />
        </div>
      )}

      {activeTab === "Notes" && (
        <div>
          <SectionHeader
            icon="fa-sticky-note"
            title="Notes"
            subtitle="Structured notes belonging to the whole collection"
          />
          {/* The hero remark editor above edits the same singleton note row, so
              hide the duplicate `remark` section wherever that editor renders. */}
          <CollectionNotes
            collection={collection}
            isAdmin={isAdmin}
            hideSections={isAdmin || collection.remark ? ["remark"] : []}
          />
        </div>
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

