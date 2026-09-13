// Frontend: the account's own settings. One switch today.
//
// The toggle writes on change rather than behind a Save button: there is one
// field, and a Save button for one boolean is a second click that can only be
// forgotten. The switch reflects the server's answer, not the click, so a
// refused write leaves it where it was.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchJson, jsonBody } from "../../api/client";
import { endpoints } from "../../api/endpoints";
import { Eyebrow, Slip } from "../../components/ui/primitives";
import { useToast } from "../../hooks/useToast";

export default function Settings() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings(await fetchJson(endpoints.account.settings()));
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function setPublic(next) {
    setSaving(true);
    try {
      const updated = await fetchJson(endpoints.account.settings(), {
        method: "PATCH",
        ...jsonBody({ list_is_public: next }),
      });
      setSettings(updated);
      showToast(
        "success",
        updated.list_is_public ? "Your list is public." : "Your list is private.",
      );
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-text-faint">Loading settings...</div>;
  }

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-text-muted">
        Sign in to change your settings.
      </div>
    );
  }

  const profilePath = `/user/${settings.username}`;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <Eyebrow className="mt-1">Account</Eyebrow>
        <p className="mt-1 text-sm text-text-muted">
          <span className="font-mono">{settings.username}</span>
          <span className="text-text-faint"> · {settings.role_name}</span>
        </p>
      </header>

      <Slip title="List visibility">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={settings.list_is_public}
            disabled={saving}
            onChange={(e) => setPublic(e.target.checked)}
            className="mt-1 accent-brand"
          />
          <span>
            <span className="block text-sm text-text">Make my list public</span>
            <span className="block text-sm text-text-muted mt-1">
              A public list can be read by anyone at{" "}
              <Link to={profilePath} className="text-brand underline">
                {profilePath}
              </Link>
              , and its ratings count towards the community figures on an
              entry&apos;s page. Your personal notes stay private either way.
            </span>
          </span>
        </label>
      </Slip>
    </div>
  );
}
