// Barrel — re-exports the media helpers now split across config/ and lib/.
// New code should import from the specific module (e.g. "../lib/covers"),
// but this keeps existing "../utils/media" imports working.
export { MEDIA_CONFIG } from "../config/mediaRegistry";
export { NAMING_CONFIGS } from "../config/namingConfigs";
export {
  WATCHING_STATUS_GROUP,
  READING_STATUS_GROUP,
  AIRING_STATUS_CLS,
  COMPLETED_STATUSES,
} from "../config/statusGroups";
export { FALLBACK_SVG, getCoverUrl } from "../lib/covers";
export { cleanString, getDisplayName, getNamingFields, getSortName } from "../lib/naming";
export {
  getStatusButtonConfig,
  getStatusStyle,
  getNextStatus,
  getReadingButtonConfig,
  getCardStatusConfig,
} from "../lib/status";
export {
  isBaha,
  getReleaseFallback,
  getRatingWeight,
  getSourceValues,
  formatLength,
  parseTypes,
  getNovelProgress,
} from "../lib/formatters";
export {
  buildAnimeMoviePayload,
  buildAnimePayload,
  buildCreditsPayload,
  creditsResponseToForm,
} from "../lib/payloads";
