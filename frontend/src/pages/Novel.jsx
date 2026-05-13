import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { getCoverUrl, FALLBACK_SVG } from "../utils/media";
import InfoCard from "../components/InfoCard";
import NamingCard from "../components/NamingCard";
import NovelTrackerBlock from "../components/NovelTrackerBlock";
import SourcesCard from "../components/SourcesCard";
import ScoreBlock from "../components/ScoreBlock";
import SeriesModal from "../components/SeriesModal";
import NovelNotes from "./NovelNotes";

function serializationStatusColor(status) {
  if (status === "連載中")
    return "bg-green-100 text-green-700 border border-green-200";
  if (status === "完結")
    return "bg-blue-100 text-blue-700 border border-blue-200";
  if (status === "腰斬") return "bg-red-100 text-red-700 border border-red-200";
  if (status === "停更")
    return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  return "bg-gray-100 text-gray-600 border border-gray-200";
}


const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

function BelongingNovelsCard({ novel, isAdmin, onSave }) {
  const cnObj = novel.novel_name_each_cn || {};
  const enObj = novel.novel_name_each_en || {};
  const allKeys = [
    ...new Set([...Object.keys(cnObj), ...Object.keys(enObj)]),
  ].sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const [items, setItems] = useState(
    allKeys.map((k) => ({ key: k, cn: cnObj[k] || "", en: enObj[k] || "" })),
  );
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState({ key: "", cn: "", en: "" });
  const [adding, setAdding] = useState(false);
  const [addVal, setAddVal] = useState({ key: "", cn: "", en: "" });

  useEffect(() => {
    const cnO = novel.novel_name_each_cn || {};
    const enO = novel.novel_name_each_en || {};
    const keys = [
      ...new Set([...Object.keys(cnO), ...Object.keys(enO)]),
    ].sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    setItems(keys.map((k) => ({ key: k, cn: cnO[k] || "", en: enO[k] || "" })));
  }, [novel.novel_name_each_cn, novel.novel_name_each_en]);

  function saveItems(next) {
    const cnResult = {};
    const enResult = {};
    next.forEach(({ key, cn, en }) => {
      if (cn) cnResult[key] = cn;
      if (en) enResult[key] = en;
    });
    onSave({
      novel_name_each_cn: Object.keys(cnResult).length ? cnResult : null,
      novel_name_each_en: Object.keys(enResult).length ? enResult : null,
    });
    setItems(next);
  }

  function commitEdit() {
    const next = [...items];
    next[editIdx] = { ...editVal };
    setEditIdx(null);
    saveItems(next);
  }

  function commitAdd() {
    if (!addVal.key.trim()) return;
    const next = [...items, { ...addVal, key: addVal.key.trim() }];
    setAdding(false);
    setAddVal({ key: "", cn: "", en: "" });
    saveItems(next);
  }

  function removeItem(i) {
    const next = items.filter((_, idx) => idx !== i);
    saveItems(next);
  }

  const nextKey = String(
    items.reduce((max, item) => {
      const n = parseInt(item.key, 10);
      return !isNaN(n) ? Math.max(max, n) : max;
    }, 0) + 1,
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h3 className="font-bold text-gray-800">
          <i className="fas fa-books text-brand mr-2"></i>Belonging Novels
        </h3>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setAddVal({ key: nextKey, cn: "", en: "" });
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-brand text-white hover:bg-brand/90 transition-colors"
          >
            <i className="fas fa-plus text-[10px]"></i> Add
          </button>
        )}
      </div>
      <div className="p-4">
        {items.length === 0 && !adding && (
          <p className="text-xs text-gray-400 italic">No entries.</p>
        )}
        <div className="space-y-2">
          {items.map((item, i) => (
            <div
              key={item.key}
              className="border border-gray-100 rounded-lg p-2.5 bg-gray-50"
            >
              {editIdx === i ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={editVal.key}
                      onChange={(e) =>
                        setEditVal({ ...editVal, key: e.target.value })
                      }
                      placeholder="Key"
                      className={inputCls}
                    />
                    <input
                      value={editVal.cn}
                      onChange={(e) =>
                        setEditVal({ ...editVal, cn: e.target.value })
                      }
                      placeholder="Chinese name"
                      className={inputCls}
                    />
                    <input
                      value={editVal.en}
                      onChange={(e) =>
                        setEditVal({ ...editVal, en: e.target.value })
                      }
                      placeholder="English name"
                      className={inputCls}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={commitEdit}
                      className="px-2 py-1 rounded text-xs font-semibold bg-brand text-white hover:bg-brand/90"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditIdx(null)}
                      className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded shrink-0">
                    {item.key}
                  </span>
                  <div className="flex-1 min-w-0">
                    {item.cn && (
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {item.cn}
                      </div>
                    )}
                    {item.en && (
                      <div className="text-xs text-gray-500 truncate">
                        {item.en}
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditIdx(i);
                          setEditVal({ ...item });
                        }}
                        className="text-gray-400 hover:text-brand text-xs px-1"
                      >
                        <i className="fas fa-pencil-alt"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-gray-400 hover:text-red-500 text-xs px-1"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {adding && (
            <div className="border border-brand/20 rounded-lg p-2.5 bg-brand/5 space-y-1.5">
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={addVal.key}
                  onChange={(e) => setAddVal({ ...addVal, key: e.target.value })}
                  placeholder="Key (e.g. 1)"
                  className={inputCls}
                />
                <input
                  value={addVal.cn}
                  onChange={(e) => setAddVal({ ...addVal, cn: e.target.value })}
                  placeholder="Chinese name"
                  className={inputCls}
                  autoFocus
                />
                <input
                  value={addVal.en}
                  onChange={(e) => setAddVal({ ...addVal, en: e.target.value })}
                  placeholder="English name"
                  className={inputCls}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={commitAdd}
                  className="px-2 py-1 rounded text-xs font-semibold bg-brand text-white hover:bg-brand/90"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setAddVal({ key: "", cn: "", en: "" });
                  }}
                  className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Novel() {
  const { system_id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [novel, setNovel] = useState(null);
  const [franchise, setFranchise] = useState(null);
  const [series, setSeries] = useState(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nRes, fRes, sRes] = await Promise.all([
        fetch(`/api/novel/${system_id}`, { credentials: "include" }),
        fetch("/api/franchise/", { credentials: "include" }),
        fetch("/api/series/", { credentials: "include" }),
      ]);
      if (!nRes.ok) throw new Error("Novel not found");
      const n = await nRes.json();
      const allFranchises = await fRes.json();
      const allSeries = await sRes.json();

      setNovel(n);
      setFranchise(
        n.franchise_id
          ? allFranchises.find((f) => f.system_id === n.franchise_id) || null
          : null,
      );
      setSeries(
        n.series_id
          ? allSeries.find((s) => s.system_id === n.series_id) || null
          : null,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [system_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setNovel((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(`/api/novel/${system_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const fresh = await fetch(`/api/novel/${system_id}`, {
        credentials: "include",
      });
      setNovel(await fresh.json());
    } catch {
      showToast("error", "Update failed");
      load();
    }
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(
        `/api/data-control/replace/novel/${system_id}`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Autofill failed");
      showToast("success", "Autofill completed");
      await load();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setAutofilling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <i className="fas fa-circle-notch fa-spin text-4xl text-brand mb-4"></i>
        <p className="text-gray-500 font-medium">Loading details...</p>
      </div>
    );
  }

  if (error || !novel) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center text-red-600 bg-red-50 p-6 rounded-xl border border-red-200">
          <i className="fas fa-exclamation-triangle mb-2 text-2xl"></i>
          <p className="font-bold">Error Loading Novel</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const titleMain =
    novel.novel_name_cn ||
    novel.novel_name_en ||
    novel.novel_name_roman ||
    novel.novel_name_jp ||
    novel.novel_name_alt ||
    "Unknown";
  const titleSub =
    novel.novel_name_en && novel.novel_name_en !== titleMain
      ? novel.novel_name_en
      : null;

  const imageUrl = getCoverUrl(novel.cover_image_file);

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  const rawSourceOther = novel.source_other || {};
  const twitterLink = rawSourceOther.Twitter || rawSourceOther.twitter || null;
  const filteredSourceOther = Object.fromEntries(
    Object.entries(rawSourceOther).filter(
      ([k]) => k.toLowerCase() !== "twitter",
    ),
  );

  const selectDisabledCls = !isAdmin
    ? "bg-gray-50 text-gray-500 cursor-not-allowed"
    : "";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Breadcrumb */}
      <nav className="flex text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-2">
          <li>
            <Link to="/library/novel" className="hover:text-brand transition">
              <i className="fas fa-book mr-1.5"></i>Novel
            </Link>
          </li>
          <li>
            <i className="fas fa-chevron-right text-[10px]"></i>
          </li>
          <li className="font-medium text-gray-900 truncate max-w-xs">
            {titleMain}
          </li>
        </ol>
      </nav>

      {/* Admin Toolbar */}
      {isAdmin && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex flex-wrap gap-3 items-center justify-between mb-8 shadow-sm">
          <div className="flex items-center text-brand font-bold text-sm uppercase tracking-wider">
            <i className="fas fa-shield-alt mr-2"></i> Admin Tools
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate(`/modify?id=${system_id}&type=novel`)}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-pencil-alt mr-2 text-brand"></i> Quick Edit
            </button>
            <button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(`/api/novel/${system_id}/complete`, {
                    method: "POST",
                    credentials: "include",
                  });
                  if (!res.ok) throw new Error("Request failed");
                  showToast("success", "Marked as Completed!");
                  await load();
                } catch {
                  showToast("error", "Update failed");
                }
              }}
              className="bg-white hover:bg-green-50 border border-gray-200 text-gray-700 hover:text-green-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center"
            >
              <i className="fas fa-check-double mr-2 text-green-500"></i> Mark
              Completed
            </button>
            <button
              onClick={handleAutofill}
              disabled={autofilling}
              className="bg-brand hover:bg-brand-hover text-white px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition flex items-center disabled:opacity-50"
            >
              <i
                className={`fas ${autofilling ? "fa-circle-notch fa-spin" : "fa-magic"} mr-2`}
              ></i>
              {autofilling ? "Autofilling..." : "Autofill & Update"}
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          {/* Poster */}
          <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
            {novel.my_rating && (
              <div className="absolute top-3 left-3 z-10 bg-yellow-400 text-yellow-900 text-xs font-black px-2 py-0.5 rounded flex items-center shadow-md">
                <i className="fas fa-star text-[9px] mr-1"></i>
                {novel.my_rating}
              </div>
            )}
            <div className="w-full aspect-[2/3] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
              <img
                src={imageUrl}
                alt="Cover"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            twitterLink={twitterLink}
            malLink={novel.mal_link}
            anilistLink={novel.anilist_link}
            sourceOther={
              Object.keys(filteredSourceOther).length > 0
                ? filteredSourceOther
                : null
            }
          />

          {/* System Info — admin only */}
          {isAdmin && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                <i className="fas fa-microchip mr-1.5"></i>System Info
              </h3>
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">
                  System ID
                </div>
                <div className="text-xs font-mono text-gray-800 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 break-all select-all">
                  {novel.system_id}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-8">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {novel.region && (
                <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider">
                  {novel.region}
                </span>
              )}
              {novel.type && (
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider">
                  {novel.type}
                </span>
              )}
              {novel.serialization_status && (
                <span
                  className={`${serializationStatusColor(novel.serialization_status)} px-2.5 py-1 rounded-md text-[11px] font-bold shadow-sm uppercase tracking-wider`}
                >
                  {novel.serialization_status}
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight mb-1">
              {titleMain}
            </h1>
            {titleSub && (
              <h2 className="text-lg text-gray-500 font-medium mb-3">
                {titleSub}
              </h2>
            )}

            {/* Franchise / Series Bar */}
            <div className="flex items-center gap-4 text-sm text-gray-500 bg-gray-50 py-2 px-3 rounded-lg border border-gray-200 mb-6">
              {franchise ? (
                <span>
                  <i className="fas fa-sitemap text-brand/50 mr-1.5"></i>
                  <Link
                    to={`/franchise/${franchise.system_id}`}
                    className="text-brand hover:underline font-medium"
                  >
                    {franchiseName}
                  </Link>
                </span>
              ) : (
                <span className="text-gray-400">
                  <i className="fas fa-unlink mr-1.5"></i>No Franchise
                </span>
              )}
              {series && (
                <>
                  <div className="hidden sm:block text-gray-300">|</div>
                  <span>
                    <i className="fas fa-layer-group text-purple-400/50 mr-1.5"></i>
                    <button
                      onClick={() => setShowSeriesModal(true)}
                      className="font-medium text-purple-600 hover:text-purple-800 hover:underline transition bg-transparent border-none cursor-pointer p-0"
                    >
                      {series.series_name_cn ||
                        series.series_name_en ||
                        series.series_name_alt}
                    </button>
                  </span>
                </>
              )}
            </div>

            {/* Score Block */}
            <ScoreBlock
              malScore={novel.mal_rating}
              malRank={novel.mal_rank}
              anilistScore={novel.anilist_rating}
              updatedAt={novel.updated_at}
            />
          </div>

          {/* My Tracker Block */}
          <NovelTrackerBlock
            novel={novel}
            isAdmin={isAdmin}
            onChChange={(v) =>
              performPatch({ ch_fin: v }, "Chapter progress saved")
            }
            onVolChange={(v) =>
              performPatch({ vol_fin: v }, "Volume progress saved")
            }
            onArcChange={(v) =>
              performPatch({ arc_fin: v }, "Arc progress saved")
            }
            onStatusChange={(v) =>
              performPatch({ reading_status: v }, "Status updated")
            }
            onRatingChange={(v) =>
              performPatch({ my_rating: v || null }, "Rating saved")
            }
            onReadNextChange={(v, msg) => performPatch({ read_next: v }, msg)}
            onToRerereadChange={(v, msg) => performPatch({ to_reread: v }, msg)}
          />

          {/* Detail Cards */}
          <div className="space-y-6">
            <NamingCard
              cn={novel.novel_name_cn}
              en={novel.novel_name_en}
              jp={novel.novel_name_jp}
              roman={novel.novel_name_roman}
              alt={novel.novel_name_alt}
            />
            <InfoCard
              title="Information"
              icon="fa-info-circle"
              fields={[
                [
                  { label: "Region", value: novel.region },
                  { label: "Type", value: novel.type },
                  { label: "Version", value: novel.version },
                ],
                [
                  { label: "本傳 / 外傳", value: novel.is_main },
                  {
                    label: "Serialization Status",
                    value: novel.serialization_status,
                  },
                ],
                [
                  {
                    label: "Release Year",
                    value:
                      novel.release_year != null
                        ? String(novel.release_year)
                        : null,
                  },
                  {
                    label: "End Year",
                    value:
                      novel.end_year != null ? String(novel.end_year) : null,
                  },
                ],
                ...(novel.alternative
                  ? [
                      [
                        {
                          label: "Alternative IDs",
                          value: novel.alternative,
                        },
                      ],
                    ]
                  : []),
                [
                  {
                    label: "Vol Total (Original)",
                    value:
                      novel.vol_total_original != null
                        ? String(novel.vol_total_original)
                        : null,
                  },
                  {
                    label: "Vol Total (TW)",
                    value:
                      novel.vol_total_tw != null
                        ? String(novel.vol_total_tw)
                        : null,
                  },
                ],
                [
                  {
                    label: "Arc Total",
                    value:
                      novel.arc_total != null ? String(novel.arc_total) : null,
                  },
                  {
                    label: "Chapter Total",
                    value:
                      novel.ch_total != null ? String(novel.ch_total) : null,
                  },
                ],
              ]}
            />
            {/* Production Card */}
            {(novel.author || novel.illustrator || novel.publisher_tw) && (
              <InfoCard
                title="Production"
                icon="fa-pen-nib"
                fields={[
                  ...(novel.author
                    ? [{ label: "Author", value: novel.author }]
                    : []),
                  ...(novel.illustrator
                    ? [{ label: "Illustrator", value: novel.illustrator }]
                    : []),
                  ...(novel.publisher_tw
                    ? [{ label: "Publisher (TW)", value: novel.publisher_tw }]
                    : []),
                ]}
              />
            )}
          </div>

          {/* Remarks */}
          {novel.remark && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                <h3 className="font-bold text-gray-800">
                  <i className="fas fa-sticky-note text-brand mr-2"></i>Remarks
                </h3>
              </div>
              <div className="p-4">
                <textarea
                  key={novel.system_id}
                  defaultValue={novel.remark || ""}
                  disabled={!isAdmin}
                  onBlur={(e) =>
                    isAdmin &&
                    performPatch(
                      { remark: e.target.value || null },
                      "Remark saved",
                    )
                  }
                  rows={4}
                  placeholder="Add remarks..."
                  className={`block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand focus:border-brand sm:text-sm ${selectDisabledCls}`}
                ></textarea>
              </div>
            </div>
          )}

          {/* Belonging Novels Card */}
          <BelongingNovelsCard
            novel={novel}
            isAdmin={isAdmin}
            onSave={(payload) => performPatch(payload, "Belonging novels saved")}
          />

          {/* Structured Notes */}
          <NovelNotes
            key={novel.system_id}
            novel={novel}
            isAdmin={isAdmin}
            onSave={(updatedNotes) =>
              performPatch({ notes: updatedNotes }, "Notes saved")
            }
          />
        </div>
      </div>

      {showSeriesModal && series && (
        <SeriesModal
          series={series}
          isAdmin={isAdmin}
          onClose={() => setShowSeriesModal(false)}
        />
      )}
    </div>
  );
}
