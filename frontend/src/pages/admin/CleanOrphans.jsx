import { useMemo, useState } from "react";

import { endpoints } from "../../api/endpoints";

/**
 * Review and delete rows the Google Sheet no longer mentions.
 *
 * The whole page exists to be honest about what disappears, so three rules
 * drive the markup:
 *
 * 1. Nothing is selected for you. Ever.
 * 2. Select-all skips rows created since the last successful Backup, because
 *    a row you made ten minutes ago looks identical to an orphan from here -
 *    the sheet simply has not been told about it yet.
 * 3. "Deleted" and "detached" are shown as different fates. A quote survives
 *    its entry (quote.media_id is ON DELETE SET NULL); calling that a deletion
 *    would be a lie, and a reviewer who catches the screen lying once stops
 *    reading the numbers.
 */

function isNewerThanBackup(candidate, lastBackupAt) {
  // With no successful Backup ever, nothing can be judged old, so everything
  // counts as new and select-all selects nothing. The reluctant direction.
  if (!lastBackupAt) return true;
  if (!candidate.created_at) return false;
  return new Date(candidate.created_at) > new Date(lastBackupAt);
}

function describeBlastRadius(candidate) {
  const deleted = Object.entries(candidate.blast_radius?.deleted ?? {})
    .filter(([, n]) => n > 0)
    .map(([what, n]) => `${n} ${what.replace(/_/g, " ")}`);
  const detached = Object.entries(candidate.blast_radius?.detached ?? {})
    .filter(([, n]) => n > 0)
    .map(([what, n]) => `${n} ${what.replace(/_/g, " ")}`);

  const parts = [];
  if (deleted.length) parts.push(`also deletes ${deleted.join(", ")}`);
  if (detached.length) parts.push(`detaches ${detached.join(", ")} (they survive)`);
  if (candidate.children > 0) {
    parts.push(`${candidate.children} child row(s) survive, unparented`);
  }
  return parts.length ? parts.join(" · ") : "nothing else";
}

export function CleanOrphansReport({ report, onApply, busy = false }) {
  const [selected, setSelected] = useState(() => new Set());

  const lastBackupAt = report?.last_backup_at ?? null;
  const tabs = report?.tabs ?? {};

  const populated = useMemo(
    () => Object.entries(tabs).filter(([, rows]) => rows.length > 0),
    [tabs],
  );

  function toggle(systemId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(systemId)) next.delete(systemId);
      else next.add(systemId);
      return next;
    });
  }

  function selectAll(rows) {
    setSelected((prev) => {
      const next = new Set(prev);
      rows
        .filter((c) => !isNewerThanBackup(c, lastBackupAt))
        .forEach((c) => next.add(c.system_id));
      return next;
    });
  }

  function apply() {
    if (selected.size === 0) return;
    const items = populated
      .flatMap(([, rows]) => rows)
      .filter((c) => selected.has(c.system_id))
      .map((c) => ({ tab: c.tab, system_id: c.system_id }));
    onApply(items);
  }

  return (
    <div className="space-y-6">
      <p data-testid="backup-stamp" className="text-sm text-text-muted">
        {lastBackupAt
          ? `Last successful Backup: ${new Date(lastBackupAt).toLocaleString()}. Anything newer than that is not missing from the sheet — the sheet has simply not been told about it yet.`
          : "No successful Backup has ever run, so nothing here can be judged old. Every row is treated as new and must be ticked by hand."}
      </p>

      {report?.anomalies?.length > 0 && (
        <div
          data-testid="anomalies"
          className="rounded border border-border bg-surface p-3 text-sm"
        >
          <p className="font-bold">Anomalies — reported, not deletable</p>
          <ul className="list-disc pl-5 text-text-muted">
            {report.anomalies.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {populated.length === 0 && (
        <p className="text-text-muted">
          Nothing to clean. Every local row is still named in the sheet.
        </p>
      )}

      {populated.map(([tab, rows]) => (
        <section key={tab} className="rounded border border-border bg-surface">
          <header className="flex items-center justify-between border-b border-border p-3">
            <h2 className="font-bold">
              {tab} — {rows.length} candidate{rows.length === 1 ? "" : "s"}
            </h2>
            <button
              type="button"
              data-testid={`select-all-${tab}`}
              onClick={() => selectAll(rows)}
              className="text-sm underline"
            >
              Select all older than the last Backup
            </button>
          </header>

          <ul className="divide-y divide-border">
            {rows.map((candidate) => {
              const isNew = isNewerThanBackup(candidate, lastBackupAt);
              return (
                <li key={candidate.system_id} className="flex gap-3 p-3">
                  <input
                    type="checkbox"
                    data-testid={`row-${candidate.system_id}`}
                    checked={selected.has(candidate.system_id)}
                    onChange={() => toggle(candidate.system_id)}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {candidate.display_name || "(no name)"}{" "}
                      <span className="text-text-muted">
                        · {candidate.label}
                        {candidate.public_id ? ` #${candidate.public_id}` : ""}
                      </span>
                    </p>
                    <p
                      data-testid={`blast-${candidate.system_id}`}
                      className="text-sm text-text-muted"
                    >
                      {describeBlastRadius(candidate)}
                    </p>
                    {isNew && (
                      <p
                        data-testid={`newer-${candidate.system_id}`}
                        className="text-sm"
                        style={{ color: "var(--color-warning)" }}
                      >
                        Created after the last Backup — probably yours, not garbage.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <button
        type="button"
        data-testid="apply"
        onClick={apply}
        disabled={busy || selected.size === 0}
        className="rounded px-4 py-2 font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: "var(--color-danger)" }}
      >
        Delete {selected.size} selected
      </button>
    </div>
  );
}

export default function CleanOrphans() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function scan() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoints.dataControl.cleanScan(), {
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Scan failed.");
      setReport(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply(items) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoints.dataControl.cleanApply(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Delete failed.");
      // Re-scan rather than mutating the list in place: the server may have
      // skipped ids it no longer considers orphaned, and the screen must show
      // what is actually true now rather than what was requested.
      await scan();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold">Clean orphaned data</h1>
      <p className="mb-4 text-text-muted">
        Finds local rows the Google Sheet no longer mentions — usually entries
        deleted on the other machine, which Pull cannot remove because it only
        inserts and updates. Nothing is deleted until you tick it.
      </p>

      <button
        type="button"
        onClick={scan}
        disabled={busy}
        className="mb-6 rounded bg-surface px-4 py-2 font-bold disabled:opacity-50"
      >
        {busy ? "Working…" : "Scan"}
      </button>

      {error && (
        <p className="mb-4" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {report && (
        <CleanOrphansReport report={report} onApply={apply} busy={busy} />
      )}
    </div>
  );
}
