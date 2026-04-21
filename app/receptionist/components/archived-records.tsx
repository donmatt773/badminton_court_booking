"use client";

import { FC, useEffect, useState } from "react";
import { useCourtNames } from "./use-court-names";

interface ArchivedBooking {
  _id: string;
  customer: { name: string; contactNumber: string; email: string } | string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  isArchived?: boolean;
  actionBy?: { name: string; username: string } | null;
}

function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h)) return hhmm;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export const ArchivedRecords: FC = () => {
  const [bookings, setBookings] = useState<ArchivedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isBulkRestoring, setIsBulkRestoring] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const courtNames = useCourtNames();

  async function fetchArchived(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bookings");
      const data = (await res.json()) as { data: ArchivedBooking[] };
      const archived = (data.data ?? []).filter((b) => b.isArchived === true || b.status === "ARCHIVED");
      setBookings(archived);
      setSelectedIds((prev) => {
        const next = new Set<string>();
        const validIds = new Set(archived.map((b) => b._id));
        prev.forEach((id) => {
          if (validIds.has(id)) next.add(id);
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchArchived(); }, []);

  async function restore(id: string): Promise<void> {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: false }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Restore failed");
      }
      await fetchArchived();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  async function restoreSelected(): Promise<void> {
    if (selectedIds.size === 0) return;
    setIsBulkRestoring(true);
    setError(null);
    try {
      await Promise.all(
        Array.from(selectedIds).map(async (id) => {
          const res = await fetch(`/api/admin/bookings/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isArchived: false }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            throw new Error(body?.error?.message ?? "Restore failed");
          }
        })
      );
      setSelectedIds(new Set());
      await fetchArchived();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk restore failed");
    } finally {
      setIsBulkRestoring(false);
    }
  }

  const filtered = bookings.filter((b) => {
    const customer =
      typeof b.customer === "object" ? b.customer : { name: String(b.customer), contactNumber: "", email: "" };
    const q = search.toLowerCase();
    return (
      customer.name.toLowerCase().includes(q) ||
      customer.email.toLowerCase().includes(q) ||
      (courtNames[b.courtId] ?? b.courtId).toLowerCase().includes(q) ||
      b.bookingDate.includes(q)
    );
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((b) => selectedIds.has(b._id));

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <p className="text-xs text-gray-500 mt-0.5">
            {bookings.length} archived booking{bookings.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            disabled={selectedIds.size === 0 || isBulkRestoring}
            onClick={() => void restoreSelected()}
            className="px-3 py-2 text-xs font-medium rounded-md border border-emerald-700/50 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-800/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isBulkRestoring ? "Restoring…" : `Restore Selected${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
          </button>
          <input
            type="text"
            placeholder="Search by customer, court, date…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-700 bg-[#0B0F1A] text-gray-200 text-sm px-3 py-2 placeholder-gray-600 outline-none focus:border-gray-500 w-64"
          />
        </div>
      </div>

      {error && (
        <p className="text-red-400 bg-red-900/20 border border-red-700/40 rounded-md px-4 py-2 mb-3 text-sm font-medium">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-emerald-600 font-medium text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-[#111827] py-16 text-center">
          <p className="text-gray-500 text-sm italic">
            {search ? "No archived bookings match your search." : "No archived bookings yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl shadow border border-gray-700">
          <table className="w-full border-collapse bg-[#111827] text-sm">
            <thead>
              <tr className="bg-[#0B0F1A] text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded border-gray-600 bg-gray-800 text-indigo-500 cursor-pointer"
                    checked={allFilteredSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          filtered.forEach((b) => next.add(b._id));
                          return next;
                        });
                      } else {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          filtered.forEach((b) => next.delete(b._id));
                          return next;
                        });
                      }
                    }}
                  />
                </th>
                <th className="px-4 py-3 font-semibold text-left">Customer</th>
                <th className="px-4 py-3 font-semibold text-left">Contact</th>
                <th className="px-4 py-3 font-semibold text-left">Court</th>
                <th className="px-4 py-3 font-semibold text-left">Date</th>
                <th className="px-4 py-3 font-semibold text-left">Time</th>
                <th className="px-4 py-3 font-semibold text-left">Status</th>
                <th className="px-4 py-3 font-semibold text-left">Actioned by</th>
                <th className="px-4 py-3 font-semibold text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const customer =
                  typeof b.customer === "object"
                    ? b.customer
                    : { name: String(b.customer), contactNumber: "-", email: "-" };
                const isRestoring = restoringId === b._id;

                return (
                  <tr
                    key={b._id}
                    className={`border-b border-gray-700/60 last:border-b-0 transition-colors ${selectedIds.has(b._id) ? "bg-indigo-950/30" : "hover:bg-[#1a2235]"}`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="rounded border-gray-600 bg-gray-800 text-indigo-500 cursor-pointer"
                        checked={selectedIds.has(b._id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(b._id);
                            else next.delete(b._id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-100">{customer.name}</div>
                      <div className="text-xs text-gray-500">{customer.email || "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{customer.contactNumber || "-"}</td>
                    <td className="px-4 py-3 text-gray-300">{courtNames[b.courtId] || b.courtId}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{b.bookingDate}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {formatTime12h(b.startTime)} – {formatTime12h(b.endTime)}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const s = b.status === "ARCHIVED" ? "COMPLETE" : b.status;
                        const colorMap: Record<string, string> = {
                          COMPLETE:  "bg-indigo-900/40 text-indigo-300 ring-indigo-700/40",
                          CANCELLED: "bg-red-900/30 text-red-300 ring-red-700/40",
                          EXPIRED:   "bg-slate-800 text-slate-400 ring-slate-600/40",
                          DENIED:    "bg-red-900/30 text-red-300 ring-red-700/40",
                          PAID:      "bg-emerald-900/30 text-emerald-300 ring-emerald-700/40",
                        };
                        const cls = colorMap[s] ?? "bg-gray-800 text-gray-400 ring-gray-600/40";
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ${cls}`}>
                            {s}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {b.actionBy ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-300">
                          <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 font-medium uppercase text-[10px]">
                            {b.actionBy.name.charAt(0)}
                          </span>
                          <span className="font-medium">{b.actionBy.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={isRestoring}
                        onClick={() => void restore(b._id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-700/50 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-800/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {isRestoring ? "Restoring…" : "Restore"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
