// Frontend: admin page for configuring Add/Modify form defaults.
//
// Two things per media type: the initial value of each form field, and which
// fields the "auto-fill from existing entry" search copies.
//
// Stored defaults are SPARSE — only fields the admin actually overrode are
// saved, so the built-in factory values stay the baseline and a field reverts
// simply by being removed. Configured defaults apply to NEW entries and as
// fallbacks for NULL values; they never rewrite existing rows.

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { endpoints } from "../../api/endpoints";
import { FORM_TABS } from "../../config/adminTabs";
import AdminTabBar from "../../components/layout/AdminTabBar";
import { BUILTIN_AUTOFILL, getFieldRegistry } from "../../config/formFields";
import DefaultsTab from "../defaults-tabs/DefaultsTab";

const emptyDraft = (type) => ({
  defaults: {},
  autofill: [...(BUILTIN_AUTOFILL[type] ?? [])],
});

/** Builds the editable draft for one type from what the server returned. */
function toDraft(type, stored) {
  return {
    defaults: { ...(stored?.defaults ?? {}) },
    // null means "not configured" — fall back to the built-in field set.
    // An empty array is a real choice and must be preserved.
    autofill: [...(stored?.autofill ?? BUILTIN_AUTOFILL[type] ?? [])],
  };
}

/** Builds a full draft map — one entry per tab — from a server config. */
function seedDrafts(config) {
  return Object.fromEntries(
    FORM_TABS.map((tab) => [tab.key, toDraft(tab.key, config?.[tab.key])]),
  );
}

function sameDraft(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Reads a JSON response, falling back if the body isn't JSON at all.
 *
 * A backend that predates a route still answers 200 — the SPA catch-all in
 * app/main.py serves index.html — so an unparseable body is a realistic
 * failure, not a theoretical one. Treat it as "nothing configured" so the page
 * still renders the built-ins instead of dying.
 */
async function readJson(res, fallback) {
  if (!res.ok) return fallback;
  try {
    return await res.json();
  } catch {
    return fallback;
  }
}

export default function FormDefaults() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState("anime");
  const [allOptions, setAllOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // `saved` mirrors the server; `drafts` holds unsaved edits for every tab, so
  // switching tabs never discards work.
  const [saved, setSaved] = useState({});
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const [fdRes, optRes] = await Promise.all([
          fetch(endpoints.formDefaults.list(), { credentials: "include" }),
          fetch(endpoints.options.list(), { credentials: "include" }),
        ]);
        const config = await readJson(fdRes, {});
        const options = await readJson(optRes, []);

        setSaved(seedDrafts(config));
        setDrafts(seedDrafts(config));
        setAllOptions(Array.isArray(options) ? options : []);

        if (!fdRes.ok) {
          showToast("error", "Could not load saved defaults — showing built-ins.");
        }
      } catch {
        // Still seed from the built-ins so the page stays usable.
        setSaved(seedDrafts({}));
        setDrafts(seedDrafts({}));
        showToast("error", "Failed to load form defaults.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const dirtyTabs = useMemo(
    () =>
      FORM_TABS.filter(
        (t) => drafts[t.key] && !sameDraft(drafts[t.key], saved[t.key]),
      ).map((t) => t.key),
    [drafts, saved],
  );

  // Warn before losing unsaved edits on reload / navigating away.
  useEffect(() => {
    if (dirtyTabs.length === 0) return;
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyTabs.length]);

  // Never undefined: an unseeded tab still renders its built-ins.
  const draft = drafts[activeTab] ?? emptyDraft(activeTab);
  const isDirty = dirtyTabs.includes(activeTab);

  function patchDraft(fn) {
    setDrafts((prev) => ({ ...prev, [activeTab]: fn(prev[activeTab]) }));
  }

  function setFieldDefault(key, value) {
    patchDraft((d) => ({ ...d, defaults: { ...d.defaults, [key]: value } }));
  }

  function clearFieldDefault(key) {
    patchDraft((d) => {
      const next = { ...d.defaults };
      delete next[key];
      return { ...d, defaults: next };
    });
  }

  function toggleAutofill(key) {
    patchDraft((d) => ({
      ...d,
      autofill: d.autofill.includes(key)
        ? d.autofill.filter((k) => k !== key)
        : [...d.autofill, key],
    }));
  }

  function setGroupAutofill(keys, on) {
    patchDraft((d) => ({
      ...d,
      autofill: on
        ? [...new Set([...d.autofill, ...keys])]
        : d.autofill.filter((k) => !keys.includes(k)),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(endpoints.formDefaults.update(activeTab), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          version: 1,
          defaults: draft.defaults,
          autofill: draft.autofill,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Save failed.");
      }
      setSaved((prev) => ({
        ...prev,
        [activeTab]: JSON.parse(JSON.stringify(draft)),
      }));
      showToast("success", "Form defaults saved.");
    } catch (err) {
      showToast("error", err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        `Reset every field on the ${activeTab} tab to its built-in default? This also restores the built-in auto-fill selection.`,
      )
    )
      return;

    setSaving(true);
    try {
      const res = await fetch(endpoints.formDefaults.reset(activeTab), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Reset failed.");
      const fresh = emptyDraft(activeTab);
      setSaved((prev) => ({ ...prev, [activeTab]: fresh }));
      setDrafts((prev) => ({
        ...prev,
        [activeTab]: JSON.parse(JSON.stringify(fresh)),
      }));
      showToast("success", "Reset to built-in defaults.");
    } catch (err) {
      showToast("error", err.message || "Reset failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-gray-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const overrideCount = Object.keys(draft.defaults).length;
  const autofillCount = draft.autofill.filter((k) =>
    getFieldRegistry(activeTab).some((f) => f.key === k),
  ).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
          <i className="fas fa-sliders-h text-brand"></i> Form Defaults
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Set the starting value of each Add-form field and choose which fields
          auto-fill copies. Applies to new entries only — existing entries are
          never changed.
        </p>
      </div>

      {/* Tabs */}
      <AdminTabBar
        tabs={FORM_TABS}
        activeTab={activeTab}
        onSelect={setActiveTab}
        renderBadge={(t) =>
          dirtyTabs.includes(t.key) ? (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          ) : null
        }
      />

      <DefaultsTab
        type={activeTab}
        draft={draft}
        setFieldDefault={setFieldDefault}
        clearFieldDefault={clearFieldDefault}
        toggleAutofill={toggleAutofill}
        setGroupAutofill={setGroupAutofill}
        allOptions={allOptions}
      />

      {/* Footer actions */}
      <div className="sticky bottom-4 mt-6 flex flex-wrap items-center gap-3 bg-white/95 backdrop-blur border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs font-bold text-gray-500">
          {overrideCount} field{overrideCount === 1 ? "" : "s"} overridden ·{" "}
          {autofillCount} auto-filled
        </span>
        {isDirty && (
          <span className="text-xs font-bold text-amber-600">
            <i className="fas fa-circle text-[6px] mr-1 align-middle"></i>
            Unsaved changes
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <i className="fas fa-undo text-xs mr-1.5"></i>
            Reset tab to built-in
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-5 py-2 bg-brand text-white rounded-lg text-xs font-black hover:opacity-90 transition disabled:opacity-40"
          >
            {saving ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <>
                <i className="fas fa-save text-xs mr-1.5"></i>Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
