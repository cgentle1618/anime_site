// Frontend: the site's primary navigation.
//
// Two rows, read as a catalog drawer:
//   1. an ink identity row — the mark, the universal search, the session
//   2. a paper tab strip — one index tab per section, where the tab you are
//      inside loses its bottom edge and opens into the page below it
//
// Every link comes from `config/navigation.js`; the desktop strip and the
// mobile drawer render the same tree, so there is one place to edit.
import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useToast } from "../../hooks/useToast";
import {
  NAV_SECTIONS,
  visibleSections,
  activeItem,
  activeSectionKey,
} from "../../config/navigation";
import NavSearch from "./NavSearch";

// Placeholder entries route to the holding page instead of their own.
function itemHref(item) {
  return item.dev ? "/under-development" : item.to;
}

// One row inside an open panel. Text only - the label is the link.
function PanelLink({ item, current, onNavigate }) {
  if (item.divider) {
    return <div className="border-t border-border my-1.5" role="separator" />;
  }
  return (
    <Link
      to={itemHref(item)}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      title={item.dev ? "Under development" : undefined}
      className={`flex items-center px-2.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        item.dev
          ? "text-text-faint hover:bg-surface-2"
          : current
            ? "bg-brand-soft text-brand font-semibold"
            : "text-text hover:bg-surface-2 hover:text-brand"
      }`}
    >
      {item.label}
    </Link>
  );
}

// A section's panel: a single list, or the library's three labelled columns.
function SectionPanel({ section, currentItem, onNavigate }) {
  if (section.columns) {
    return (
      <div className="flex gap-6 p-3">
        {section.columns.map((col) => (
          <div key={col.heading} className="min-w-[9.5rem]">
            <div className="px-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
              {col.heading}
            </div>
            <div className="space-y-0.5">
              {col.items.map((item) => (
                <PanelLink
                  key={item.label}
                  item={item}
                  current={item === currentItem}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="p-2 space-y-0.5 min-w-[12rem]">
      {section.items.map((item, i) => (
        <PanelLink
          key={item.label ?? `divider-${i}`}
          item={item}
          current={item === currentItem}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

// Icon-only control on the ink row.
const INK_ICON_BTN =
  "px-2 py-1.5 text-ink-text/60 hover:text-ink-text hover:bg-ink-text/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

// Text row in the mobile drawer.
const DRAWER_ROW =
  "flex w-full items-center px-2.5 py-2 text-sm text-text hover:bg-surface-2 transition";

export default function Nav() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { isAdmin, has, refetchAuth } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const stripRef = useRef(null);
  const triggerRefs = useRef({});

  const sections = visibleSections(NAV_SECTIONS, has);
  const currentSection = activeSectionKey(location.pathname);
  const currentItem = activeItem(location.pathname)?.item ?? null;

  // Any route change closes whatever was open.
  useEffect(() => {
    setOpenKey(null);
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  // Clicking away from the strip closes the open panel.
  useEffect(() => {
    if (!openKey) return;
    function handler(e) {
      if (stripRef.current && !stripRef.current.contains(e.target)) {
        setOpenKey(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openKey]);

  // Escape closes and hands focus back to the tab that opened the panel;
  // the arrow keys walk the links inside it.
  function handleStripKeyDown(e) {
    if (e.key === "Escape" && openKey) {
      e.stopPropagation();
      const trigger = triggerRefs.current[openKey];
      setOpenKey(null);
      trigger?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const panel = stripRef.current?.querySelector("[data-nav-panel]");
    if (!panel) return;
    const links = [...panel.querySelectorAll("a")];
    if (links.length === 0) return;
    e.preventDefault();
    const at = links.indexOf(document.activeElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = at === -1 ? (step === 1 ? 0 : links.length - 1) : at + step;
    links[(next + links.length) % links.length].focus();
  }

  async function handleBackup() {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const res = await fetch("/api/data-control/backup", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        showToast("success", "Backup completed");
      } else {
        showToast("error", "Backup failed");
      }
    } catch {
      showToast("error", "Backup failed");
    } finally {
      setBackingUp(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await refetchAuth();
    navigate(location.pathname + location.search, { replace: true });
  }

  const loginHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <nav className="sticky top-0 z-50">
      {/* Row 1 — the drawer front */}
      <div className="bg-ink text-ink-text">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <Link
              to="/"
              className="flex items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="font-mono text-base tracking-[0.14em] text-ink-text">
                CG1618
              </span>
            </Link>

            <NavSearch />

            <div className="flex items-center gap-2 shrink-0">
              {isAdmin ? (
                <>
                  <span className="hidden sm:inline-flex items-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-text/60 border border-ink-text/30 px-1.5 py-0.5">
                    Admin
                  </span>
                  <button
                    type="button"
                    onClick={handleBackup}
                    disabled={backingUp}
                    className="hidden md:inline-flex items-center bg-brand hover:bg-brand-hover px-3 py-1.5 text-xs font-medium text-on-brand transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-text/60"
                  >
                    {backingUp ? "Backing up…" : "Back up"}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Log out"
                    aria-label="Log out"
                    className={`${INK_ICON_BTN} hover:text-danger`}
                  >
                    <i className="fas fa-sign-out-alt text-sm"></i>
                  </button>
                </>
              ) : (
                <Link
                  to={loginHref}
                  className="inline-flex items-center border border-ink-text/40 hover:border-ink-text px-3 py-1.5 text-xs font-medium text-ink-text transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Log in
                </Link>
              )}

              <button
                type="button"
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                aria-pressed={theme === "dark"}
                className={INK_ICON_BTN}
              >
                <i className={`fas ${theme === "dark" ? "fa-sun" : "fa-moon"} text-sm`}></i>
              </button>

              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                aria-expanded={mobileOpen}
                aria-label="Toggle navigation"
                className={`lg:hidden ${INK_ICON_BTN}`}
              >
                <i className={`fas ${mobileOpen ? "fa-xmark" : "fa-bars"}`}></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2 — the index tabs. The active tab drops its bottom edge and
          merges into the page canvas below. */}
      <div
        ref={stripRef}
        onKeyDown={handleStripKeyDown}
        className="hidden lg:block bg-surface border-b border-border"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end gap-1">
            {sections.map((section) => {
              const isCurrent = section.key === currentSection;
              const isOpen = section.key === openKey;
              return (
                <div key={section.key} className="relative">
                  <button
                    type="button"
                    ref={(el) => (triggerRefs.current[section.key] = el)}
                    onClick={() =>
                      setOpenKey((k) => (k === section.key ? null : section.key))
                    }
                    aria-expanded={isOpen}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`relative -mb-px flex h-10 items-center border px-4 font-mono text-[11px] uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset ${
                      isCurrent
                        ? "border-border border-b-canvas bg-canvas text-text"
                        : isOpen
                          ? "border-transparent text-text"
                          : "border-transparent text-text-muted hover:text-text"
                    }`}
                  >
                    {/* The brand cap marks the drawer you have open. */}
                    {isCurrent && (
                      <span className="absolute inset-x-0 top-0 h-0.5 bg-brand"></span>
                    )}
                    {section.label}
                  </button>

                  {isOpen && (
                    <div
                      data-nav-panel
                      className="absolute left-0 top-full mt-px z-50 bg-surface border border-border shadow-xl"
                    >
                      <SectionPanel
                        section={section}
                        currentItem={currentItem}
                        onNavigate={() => setOpenKey(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile drawer — same tree, stacked */}
      {mobileOpen && (
        <div className="lg:hidden bg-surface border-b border-border shadow-lg max-h-[80vh] overflow-y-auto">
          <div className="px-4 py-3 space-y-4">
            {sections.map((section) => (
              <div key={section.key}>
                <div className="px-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  {section.label}
                </div>
                {section.columns ? (
                  section.columns.map((col) => (
                    <div key={col.heading} className="pl-2">
                      <div className="px-2.5 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">
                        {col.heading}
                      </div>
                      {col.items.map((item) => (
                        <PanelLink
                          key={item.label}
                          item={item}
                          current={item === currentItem}
                          onNavigate={() => setMobileOpen(false)}
                        />
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="space-y-0.5">
                    {section.items.map((item, i) => (
                      <PanelLink
                        key={item.label ?? `divider-${i}`}
                        item={item}
                        current={item === currentItem}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="border-t border-border pt-3">
              {isAdmin ? (
                <>
                  <button type="button" onClick={toggleTheme} className={DRAWER_ROW}>
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      handleBackup();
                    }}
                    className={DRAWER_ROW}
                  >
                    Back up data
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      handleLogout();
                    }}
                    className="flex w-full items-center px-2.5 py-2 text-sm text-danger hover:bg-danger/10 transition"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <Link
                  to={loginHref}
                  onClick={() => setMobileOpen(false)}
                  className={DRAWER_ROW}
                >
                  Log in
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
