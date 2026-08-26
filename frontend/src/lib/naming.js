// Display-name resolution and name-field helpers.

import { NAMING_CONFIGS } from "../config/namingConfigs";

export function cleanString(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[\s\-:;,.'"!?()[\]{}<>~`+*&^%$#@!\\/|]/g, "");
}

export function getDisplayName(item, type) {
  if (!item) return "";
  const prefix =
    type === "anime-movie"
      ? "anime_movie"
      : type === "tv-show"
        ? "tv"
        : type;
  if (type === "series") {
    return (
      item.series_name_cn ||
      item.series_name_en ||
      item.series_name_alt ||
      "Unknown Series"
    );
  }
  return (
    item[`${prefix}_name_cn`] ||
    item[`${prefix}_name_en`] ||
    item[`${prefix}_name_alt`] ||
    item[`${prefix}_name_roman`] ||
    item[`${prefix}_name_jp`] ||
    "Unknown Title"
  );
}

const NAMING_LABELS = {
  cn: "Chinese",
  en: "English",
  jp: "Japanese",
  roman: "Roman",
  alt: "Alternative",
};

export function getNamingFields(item, type) {
  const fields = NAMING_CONFIGS[type] || [];
  return fields.map((field) => {
    const suffix = field.split("_").pop();
    return {
      label: NAMING_LABELS[suffix] || field,
      value: item?.[field],
    };
  });
}

export function getSortName(item, type) {
  if (!item) return "";
  const prefix =
    type === "anime-movie"
      ? "anime_movie"
      : type === "tv-show"
        ? "tv"
        : type;
  if (type === "series") {
    return (
      item.series_name_en || item.series_name_cn || item.series_name_alt || ""
    );
  }
  return (
    item[`${prefix}_name_en`] ||
    item[`${prefix}_name_roman`] ||
    item[`${prefix}_name_cn`] ||
    item[`${prefix}_name_alt`] ||
    item[`${prefix}_name_jp`] ||
    ""
  );
}

// Shorten a name from the middle instead of the end: "beginning…end" keeps the
// tail, which is where a sequel's season or part number lives - the very piece
// a plain end-truncation ("beginning middle…") throws away.
export function middleTruncate(name, max) {
  const text = String(name ?? "");
  if (max <= 1 || text.length <= max) return text;
  const keep = max - 1; // the ellipsis costs one character
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${text.slice(0, head).trimEnd()}…${tail ? text.slice(-tail).trimStart() : ""}`;
}
