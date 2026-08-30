// Watch/read status button/style config and status-cycle helpers.

// Watching status cycle: same order as base.js
const STATUS_CYCLE = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
  "Active Watching",
  "Passive Watching",
  "Paused",
  "Completed",
  "Completed (解說)",
  "Temp Dropped",
  "Won't Watch",
  "Dropped",
];

const STATUS_STYLES = {
  "Active Watching": {
    cls: "bg-green-50 text-green-600 border-green-200",
    icon: "fa-play",
  },
  "Passive Watching": {
    cls: "bg-teal-50 text-teal-600 border-teal-200",
    icon: "fa-headphones",
  },
  Paused: {
    cls: "bg-yellow-50 text-yellow-600 border-yellow-200",
    icon: "fa-pause",
  },
  Completed: {
    cls: "bg-blue-50 text-blue-600 border-blue-200",
    icon: "fa-check",
  },
  "Completed (解說)": {
    cls: "bg-indigo-50 text-indigo-600 border-indigo-200",
    icon: "fa-comment-dots",
  },
  "Plan to Watch": {
    cls: "bg-purple-50 text-purple-600 border-purple-200",
    icon: "fa-bookmark",
  },
  "Watch When Airs": {
    cls: "bg-orange-50 text-orange-600 border-orange-200",
    icon: "fa-clock",
  },
  "Temp Dropped": {
    cls: "bg-red-50 text-red-400 border-red-200",
    icon: "fa-pause-circle",
  },
  Dropped: {
    cls: "bg-red-50 text-red-600 border-red-200",
    icon: "fa-times-circle",
  },
  "Won't Watch": {
    cls: "bg-surface-2 text-text-faint border-border",
    icon: "fa-ban",
  },
  "Might Watch": {
    cls: "bg-surface-2 text-text-faint border-border",
    icon: "fa-question",
  },
};

const STATUS_BUTTON_CONFIG = {
  "Might Watch": {
    symbol: "+",
    cls: "bg-surface-2 text-text-faint border-border",
    target: "Plan to Watch",
  },
  "Plan to Watch": {
    symbol: "…",
    cls: "bg-purple-50 text-purple-600 border-purple-200",
    target: "Might Watch",
  },
  "Watch When Airs": {
    symbol: "…",
    cls: "bg-purple-50 text-purple-600 border-purple-200",
    target: "Might Watch",
  },
  "Active Watching": {
    symbol: "~",
    cls: "bg-green-50 text-green-600 border-green-200",
    target: "Might Watch",
  },
  "Passive Watching": {
    symbol: "~",
    cls: "bg-green-50 text-green-600 border-green-200",
    target: "Might Watch",
  },
  Paused: {
    symbol: "~",
    cls: "bg-yellow-50 text-yellow-600 border-yellow-200",
    target: "Might Watch",
  },
  Completed: {
    symbol: "✓",
    cls: "bg-blue-50 text-blue-600 border-blue-200",
    target: "Might Watch",
  },
  "Completed (解說)": {
    symbol: "✓",
    cls: "bg-indigo-50 text-indigo-600 border-indigo-200",
    target: "Might Watch",
  },
  "Temp Dropped": {
    symbol: "✕",
    cls: "bg-red-50 text-red-500 border-red-200",
    target: "Might Watch",
  },
  Dropped: {
    symbol: "✕",
    cls: "bg-red-50 text-red-600 border-red-200",
    target: "Might Watch",
  },
  "Won't Watch": {
    symbol: "✕",
    cls: "bg-red-50 text-red-400 border-red-200",
    target: "Might Watch",
  },
};

export function getStatusButtonConfig(status) {
  return STATUS_BUTTON_CONFIG[status] || STATUS_BUTTON_CONFIG["Might Watch"];
}

export function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES["Might Watch"];
}

export function getNextStatus(current) {
  const idx = STATUS_CYCLE.indexOf(current);
  if (idx === -1) return "Might Watch";
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

const READING_BUTTON_CONFIG = {
  "Might Read": { symbol: "+", cls: "bg-surface-2 text-text-faint border-border", target: "Plan to Read" },
  "Plan to Read": { symbol: "…", cls: "bg-purple-50 text-purple-600 border-purple-200", target: "Might Read" },
  "Active Reading": { symbol: "~", cls: "bg-green-50 text-green-600 border-green-200", target: "Might Read" },
  "Passive Reading": { symbol: "~", cls: "bg-green-50 text-green-600 border-green-200", target: "Might Read" },
  Paused: { symbol: "~", cls: "bg-yellow-50 text-yellow-600 border-yellow-200", target: "Might Read" },
  Completed: { symbol: "✓", cls: "bg-blue-50 text-blue-600 border-blue-200", target: "Might Read" },
  "Completed (解說)": { symbol: "✓", cls: "bg-indigo-50 text-indigo-600 border-indigo-200", target: "Might Read" },
  "Temp Dropped": { symbol: "✕", cls: "bg-red-50 text-red-500 border-red-200", target: "Might Read" },
  Dropped: { symbol: "✕", cls: "bg-red-50 text-red-600 border-red-200", target: "Might Read" },
  "Won't Read": { symbol: "✕", cls: "bg-red-50 text-red-400 border-red-200", target: "Might Read" },
};

export function getReadingButtonConfig(status) {
  return READING_BUTTON_CONFIG[status] || READING_BUTTON_CONFIG["Might Read"];
}

export function getCardStatusConfig(type, status) {
  if (type === "manga" || type === "novel" || type === "comic")
    return getReadingButtonConfig(status);
  return getStatusButtonConfig(status);
}
