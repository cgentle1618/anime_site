// Frontend: the dashboard's card/list view preference.
//
// Which layout the dashboard draws - roomy cards or compact rows - is a
// display choice about this screen, so it lives in this browser's
// localStorage and never reaches the server. It does not follow you to
// another machine, and nobody else can see which layout you prefer.
//
// Both functions always return one of MODES. The dashboard picks a layout
// from the result and has no third branch to fall into, so a stored value
// that is absent, corrupt, or written by a future version of the app has to
// read as "card" rather than as undefined.
export const DASHBOARD_VIEW_KEY = "cg1618:dashboard-view";
export const DEFAULT_VIEW = "card";
export const MODES = ["card", "list"];

function known(mode) {
  return MODES.includes(mode);
}

// Every read and write goes through a try/catch: a private window, blocked
// site data or a full quota must degrade to the default layout, never to a
// dashboard that fails to render.
export function readDashboardView() {
  let raw;
  try {
    raw = localStorage.getItem(DASHBOARD_VIEW_KEY);
  } catch {
    return DEFAULT_VIEW;
  }
  return known(raw) ? raw : DEFAULT_VIEW;
}

export function writeDashboardView(mode) {
  if (!known(mode)) return DEFAULT_VIEW;
  try {
    localStorage.setItem(DASHBOARD_VIEW_KEY, mode);
  } catch {
    // The toggle has already moved on screen by the time this runs. A quota
    // or permissions failure means the choice does not outlive the tab, which
    // is not worth interrupting the viewer over.
  }
  return mode;
}
