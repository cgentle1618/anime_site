// Frontend: the one library page. /library/:type picks the per-type config;
// eight near-identical page components used to do this by hand.
import { Navigate, useParams } from "react-router-dom";

import LibraryLayout from "../../components/layout/LibraryLayout";
import { LIST_OPTIONS, useMediaList } from "../../hooks/useMediaList";
import { LIBRARY_CONFIGS } from "./configs";

const EMPTY = [];

export default function Library() {
  const { type } = useParams();
  const config = LIBRARY_CONFIGS[type];
  const usesSeries = Boolean(config?.usesSeries);

  const listQuery = useMediaList(type, { ...LIST_OPTIONS, enabled: !!config });
  const franchiseQuery = useMediaList("franchise", { ...LIST_OPTIONS, enabled: !!config });
  const seriesQuery = useMediaList("series", { ...LIST_OPTIONS, enabled: !!config && usesSeries });

  if (!config) return <Navigate to="/under-development" replace />;

  const isLoading =
    listQuery.isLoading || franchiseQuery.isLoading || (usesSeries && seriesQuery.isLoading);
  const error =
    listQuery.error?.message ||
    franchiseQuery.error?.message ||
    (usesSeries && seriesQuery.error?.message) ||
    null;

  return (
    <LibraryLayout
      type={type}
      config={config}
      // A stable empty array while loading keeps useLibraryState's memos intact.
      data={listQuery.data ?? EMPTY}
      franchises={franchiseQuery.data ?? EMPTY}
      series={usesSeries ? (seriesQuery.data ?? EMPTY) : EMPTY}
      isLoading={isLoading}
      error={error}
    />
  );
}
