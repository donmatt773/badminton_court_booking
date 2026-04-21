"use client";

import React, { FC, useEffect, useState } from "react";

type UserInfo = {
  id: string;
  username: string;
  name: string;
  role: string;
};

// ---------------------------------------------------------------------------
// Theme toggle — persisted to localStorage, applies data-theme to <html>
// ---------------------------------------------------------------------------
function useTheme(): [string, (t: string) => void] {
  // Read the attribute already set by the anti-flash inline script in layout.tsx
  const [theme, setThemeState] = useState<string>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.getAttribute("data-theme") ?? "dark";
    }
    return "dark";
  });

  function setTheme(t: string) {
    setThemeState(t);
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }

  return [theme, setTheme];
}

// ---------------------------------------------------------------------------
// Input helper
// ---------------------------------------------------------------------------
const Field: FC<{
  label: string;
  type?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  hint?: string;
}> = ({ label, type = "text", value, placeholder, onChange, hint }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</label>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-700 bg-[#0B0F1A] text-gray-100 px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
    />
    {hint && <span className="text-xs text-gray-500">{hint}</span>}
  </div>
);

// ---------------------------------------------------------------------------
// Main ProfileTab
// ---------------------------------------------------------------------------
export const ProfileTab: FC = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Profile fields
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [theme, setTheme] = useTheme();

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d: { data?: UserInfo; error?: { message?: string } }) => {
        if (d.data) {
          setUser(d.data);
          setName(d.data.name);
          setUsername(d.data.username);
        } else {
          setLoadError(d.error?.message ?? "Failed to load profile");
        }
      })
      .catch(() => setLoadError("Failed to load profile"));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/admin/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name !== user.name ? name : undefined,
          username: username !== user.username ? username : undefined,
        }),
      });
      const data = await res.json() as { data?: UserInfo; error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message ?? "Update failed");
      setUser(data.data!);
      setName(data.data!.name);
      setUsername(data.data!.username);
      setProfileMsg({ text: "Profile updated successfully.", ok: true });
    } catch (err) {
      setProfileMsg({ text: err instanceof Error ? err.message : "Update failed", ok: false });
    } finally {
      setProfileSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "New passwords do not match.", ok: false });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ text: "New password must be at least 6 characters.", ok: false });
      return;
    }
    setPasswordSaving(true);
    setPasswordMsg(null);
    try {
      const res = await fetch("/api/admin/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json() as { error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message ?? "Update failed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ text: "Password changed successfully.", ok: true });
    } catch (err) {
      setPasswordMsg({ text: err instanceof Error ? err.message : "Update failed", ok: false });
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3 text-sm">
        {loadError}
      </div>
    );
  }

  if (!user) {
    return <p className="text-emerald-500 text-sm font-medium">Loading profile…</p>;
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-6">

      {/* ── Account info card ── */}
      <div className="bg-[#111827] rounded-xl border border-gray-700 p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-emerald-700 flex items-center justify-center text-white text-2xl font-bold uppercase select-none">
            {user.name.charAt(0)}
          </div>
          <div>
            <div className="text-gray-100 font-semibold text-lg">{user.name}</div>
            <div className="text-gray-400 text-sm">@{user.username}</div>
            <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/40 text-emerald-400 ring-1 ring-emerald-700/50">
              {user.role}
            </span>
          </div>
        </div>

        <form onSubmit={(e) => void saveProfile(e)} className="flex flex-col gap-4">
          <Field label="Display Name" value={name} onChange={setName} placeholder="Your full name" />
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            placeholder="your_username"
            hint="Lowercase only. Used to log in."
          />
          {profileMsg && (
            <p className={`text-sm font-medium ${profileMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {profileMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={profileSaving}
            className="self-end px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {profileSaving ? "Saving…" : "Save Profile"}
          </button>
        </form>
      </div>

      {/* ── Change password card ── */}
      <div className="bg-[#111827] rounded-xl border border-gray-700 p-6">
        <h3 className="text-gray-100 font-semibold mb-4">Change Password</h3>
        <form onSubmit={(e) => void savePassword(e)} className="flex flex-col gap-4">
          <Field
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="••••••••"
          />
          <Field
            label="New Password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Min. 6 characters"
          />
          <Field
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Repeat new password"
          />
          {passwordMsg && (
            <p className={`text-sm font-medium ${passwordMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {passwordMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={passwordSaving}
            className="self-end px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {passwordSaving ? "Saving…" : "Change Password"}
          </button>
        </form>
      </div>

      {/* ── Appearance card ── */}
      <div className="bg-[#111827] rounded-xl border border-gray-700 p-6">
        <h3 className="text-gray-100 font-semibold mb-1">Appearance</h3>
        <p className="text-gray-500 text-xs mb-4">Choose your preferred color theme.</p>
        <div className="flex gap-3">
          {[
            { key: "dark",  label: "Dark",  icon: "🌙" },
            { key: "light", label: "Light", icon: "☀️" },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              className={[
                "flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border text-sm font-medium transition-colors",
                theme === key
                  ? "border-emerald-500 bg-emerald-900/30 text-emerald-400"
                  : "border-gray-700 bg-[#0B0F1A] text-gray-400 hover:border-gray-500",
              ].join(" ")}
            >
              <span className="text-2xl">{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-3">
          Full theme switching is stored in your browser preferences.
        </p>
      </div>

    </div>
  );
};
