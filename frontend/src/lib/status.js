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
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-play",
  },
  "Passive Watching": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-headphones",
  },
  Paused: {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-pause",
  },
  Completed: {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-check",
  },
  "Completed (解說)": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-comment-dots",
  },
  "Plan to Watch": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-bookmark",
  },
  "Watch When Airs": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-clock",
  },
  "Temp Dropped": {
    cls: "bg-surface text-text-faint border-border-strong",
    icon: "fa-pause-circle",
  },
  Dropped: {
    cls: "bg-surface text-text-faint border-border-strong",
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
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Watch When Airs": {
    symbol: "…",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Active Watching": {
    symbol: "~",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Passive Watching": {
    symbol: "~",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  Paused: {
    symbol: "~",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  Completed: {
    symbol: "✓",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Completed (解說)": {
    symbol: "✓",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Temp Dropped": {
    symbol: "✕",
    cls: "bg-surface text-text-faint border-border-strong",
    target: "Might Watch",
  },
  Dropped: {
    symbol: "✕",
    cls: "bg-surface text-text-faint border-border-strong",
    target: "Might Watch",
  },
  "Won't Watch": {
    symbol: "✕",
    cls: "bg-surface text-text-faint border-border-strong",
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
  "Plan to Read": { symbol: "…", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  "Active Reading": { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  "Passive Reading": { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  Paused: { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  Completed: { symbol: "✓", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  "Completed (解說)": { symbol: "✓", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  "Temp Dropped": { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Read" },
  Dropped: { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Read" },
  "Won't Read": { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Read" },
};

export function getReadingButtonConfig(status) {
  return READING_BUTTON_CONFIG[status] || READING_BUTTON_CONFIG["Might Read"];
}

export function getCardStatusConfig(type, status) {
  if (type === "manga" || type === "novel" || type === "comic")
    return getReadingButtonConfig(status);
  return getStatusButtonConfig(status);
}
