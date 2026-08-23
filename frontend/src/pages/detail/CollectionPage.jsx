// Frontend: page component file for CollectionPage.
//
// The Collection hub. Deliberately much simpler than the Franchise hub: a
// collection groups franchises, not media entries, so there are no per-type
// tabs, no status filters and no roll-up statistics here. Clicking a member
// card lands on the normal Franchise hub.
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
import TierBadge, { tierAccent } from "../../components/layout/TierBadge";
import FranchiseCard from "../../components/cards/FranchiseCard";
import RemarkModal from "../../components/modals/RemarkModal";
import { mediaScope } from "../../components/tracker/WatchOrderGuide";
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
        ] = await Promise.all(responses.map((r) => r.json()));

        const allEntries = [
          ...anime,
          ...animeMovies,
          ...movies,
          ...tvShows,
          ...cartoons,
          ...mangas,
          ...novels,
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading collection...</p>
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-red-500">
          <i className="fas fa-exclamation-circle text-2xl mb-2"></i>
          <p className="font-medium">{error || "Collection not found"}</p>
          <Link
            to="/library/collection"
            className="text-brand hover:underline text-sm mt-3 inline-block"
          >
            Back to Collection Library
          </Link>
        </div>
      </div>
    );
  }

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/library/collection"
            className="text-sm text-gray-400 hover:text-brand transition flex items-center gap-1.5"
          >
            <i className="fas fa-chevron-left text-xs"></i>
            Collection Library
          </Link>
          {isAdmin && (
            <Link
              to={`/modify?id=${collection.system_id}`}
              className="text-xs font-bold text-gray-500 hover:text-brand transition flex items-center gap-1.5 border border-gray-200 bg-white rounded-lg px-3 py-1.5"
            >
              <i className="fas fa-pen text-[10px]"></i>
              Quick Edit
            </Link>
          )}
        </div>

        {/* Hero */}
        <div
          className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6 ${tierAccent("collection")}`}
        >
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* Cover */}
            <div className="w-28 sm:w-36 lg:w-40 shrink-0">
              <div className="w-full aspect-[2/3] bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                <img
                  src={coverUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                />
              </div>
            </div>

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
          </div>

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
        </div>

        {/* Member franchises */}
        <h2 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-3">
          Franchises
        </h2>
        {sortedMembers.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <i className="fas fa-sitemap text-gray-300 text-3xl mb-3"></i>
            <p className="text-gray-500 font-medium">
              No franchises in this collection yet
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Assign one from the Franchise tab on the Modify page.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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

        {/*
          A section rather than a tab: this page has no tab bar, since a
          collection groups franchises instead of media entries.
        */}
        <h2 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-3 mt-10">
          Watch Order
        </h2>
        <CollectionWatchOrders collectionId={system_id} />

        {/*
          Likewise a section, and owned by the collection itself. Memes live
          inside it: the section registry gives `memes` to every owner, so the
          Notes tab renders them alongside the rest.
        */}
        <h2 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-3 mt-10">
          Notes
        </h2>
        <CollectionNotes collection={collection} isAdmin={isAdmin} />
      </div>

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
    </div>
  );
}

// The collection hub links out to its watch orders instead of rendering one
// inline: a cross-franchise order is long, and the guide already has a page of
// its own.
function CollectionWatchOrders({ collectionId }) {
  const { isAdmin } = useAuth();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(
      buildUrl(endpoints.watchOrder.lists(), { collection_id: collectionId }),
      { credentials: "include" },
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data) => {
        if (!alive) return;
        setLists(data);
        setError(null);
      })
      .catch(() => {
        if (alive) setError("Could not load watch orders.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [collectionId]);

  if (loading) {
    return (
      <div className="py-10 text-center text-gray-400">
        <i className="fas fa-circle-notch fa-spin text-xl"></i>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-gray-400 font-medium text-sm">
        {error}
      </div>
    );
  }

  if (!lists.length) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
        <i className="fas fa-list-ol text-3xl mb-3"></i>
        <p className="font-medium">No watch order has been written yet.</p>
        {isAdmin && (
          <Link
            to="/watch-orders"
            className="text-sm font-bold text-brand hover:underline mt-3 inline-block"
          >
            Build one
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
      {lists.map((l) => {
        const scope = mediaScope(l.media_types);
        return (
          <Link
            key={l.system_id}
            to={`/watch-order/${l.system_id}`}
            className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition"
          >
            <i className="fas fa-list-ol text-gray-300 shrink-0"></i>
            <span className="font-bold text-sm text-gray-900 truncate">
              {l.list_name || "Untitled Order"}
            </span>
            {l.is_most_recommended && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap shrink-0">
                <i className="fas fa-star mr-1"></i>Most recommended
              </span>
            )}
            <span className="ml-auto flex items-center gap-3 text-xs font-bold text-gray-400 whitespace-nowrap shrink-0">
              {scope && <span>{scope.short}</span>}
              <span>{l.item_count} steps</span>
              <i className="fas fa-chevron-right text-gray-300"></i>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
