// Frontend: page component file for CollectionPage.
//
// The Collection hub. Deliberately much simpler than the Franchise hub: a
// collection groups franchises, not media entries, so there are no per-type
// tabs, no status filters and no roll-up statistics here. Clicking a member
// card lands on the normal Franchise hub.
import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
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
import { getFranchiseCover } from "../../lib/covers";
import FranchiseCard from "../../components/cards/FranchiseCard";

const RATING_COLORS = {
  S: "bg-yellow-400 text-yellow-900",
  "A+": "bg-emerald-500 text-white",
  A: "bg-emerald-400 text-white",
  B: "bg-blue-400 text-white",
  C: "bg-gray-400 text-white",
  D: "bg-orange-400 text-white",
  E: "bg-red-400 text-white",
  F: "bg-red-600 text-white",
};

const EXPECTATION_STYLES = {
  Highest: "bg-purple-100 text-purple-700 border-purple-200",
  High: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-gray-100 text-gray-500 border-gray-200",
};

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

  const name = getDisplayName(collection, "collection") || "Unknown Collection";
  const ratingCls = RATING_COLORS[collection.my_rating] || "";
  const expectCls =
    EXPECTATION_STYLES[collection.collection_expectation] ||
    "bg-gray-100 text-gray-500 border-gray-200";
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black text-gray-900 leading-tight">
                  {name}
                </h1>
                {collection.my_rating && (
                  <span
                    className={`${ratingCls} text-xs font-black px-2 py-0.5 rounded flex items-center gap-1`}
                  >
                    <i className="fas fa-star text-[9px]"></i>
                    {collection.my_rating}
                  </span>
                )}
                {collection.collection_expectation && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded border ${expectCls}`}
                  >
                    {collection.collection_expectation}
                  </span>
                )}
              </div>
              {altNames.length > 0 && (
                <div className="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-3">
                  {altNames.map((f) => (
                    <span key={f.label}>{f.value}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {members.length}{" "}
                {members.length === 1 ? "franchise" : "franchises"} in this
                collection
              </p>
            </div>

            {/* Admin inline controls */}
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={collection.my_rating || ""}
                  onChange={(e) => saveField("my_rating", e.target.value)}
                  className="bg-gray-100 border border-transparent rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand transition"
                >
                  <option value="">Rating: —</option>
                  {MY_RATINGS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  value={collection.collection_expectation || ""}
                  onChange={(e) =>
                    saveField("collection_expectation", e.target.value)
                  }
                  className="bg-gray-100 border border-transparent rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand transition"
                >
                  <option value="">Expectation: —</option>
                  {FRANCHISE_EXPECTATIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Remark */}
          {(isAdmin || collection.remark) && (
            <div className="mt-4">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Remark
              </label>
              <textarea
                value={remarkDraft}
                disabled={!isAdmin}
                onChange={(e) => setRemarkDraft(e.target.value)}
                onBlur={() => {
                  if (remarkDraft !== (collection.remark || ""))
                    saveField("remark", remarkDraft);
                }}
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
      </div>
    </div>
  );
}
