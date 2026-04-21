"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";

type Court = {
  _id: string;
  name: string;
};

type BlockedSlot = {
  _id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  createdAt: string;
};

function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    return time;
  }

  const normalizedHour = hours % 12 === 0 ? 12 : hours % 12;
  const period = hours < 12 ? "AM" : "PM";
  return `${normalizedHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

type NewBlockForm = {
  courtIds: string[];
  bookingDate: string;
  startTime: string;
  endTime: string;
  reason: string;
};

export function BlockedSlotManager() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);

  const [form, setForm] = useState<NewBlockForm>({
    courtIds: [],
    bookingDate: todayISODate(),
    startTime: "08:00",
    endTime: "09:00",
    reason: "",
  });

  const courtNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const court of courts) {
      map[court._id] = court.name;
    }
    return map;
  }, [courts]);

  async function loadData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [courtsRes, blockedRes] = await Promise.all([
        fetch("/api/admin/courts"),
        fetch("/api/admin/blocked-slots"),
      ]);

      if (!courtsRes.ok) {
        throw new Error("Failed to load courts");
      }

      if (!blockedRes.ok) {
        throw new Error("Failed to load blocked slots");
      }

      const courtsBody = (await courtsRes.json()) as { data?: Court[] };
      const blockedBody = (await blockedRes.json()) as { data?: BlockedSlot[] };

      const nextCourts = courtsBody.data ?? [];
      setCourts(nextCourts);
      setBlockedSlots(blockedBody.data ?? []);

      setForm((prev) => {
        const validCourtIds = prev.courtIds.filter((id) =>
          nextCourts.some((court) => court._id === id)
        );
        if (validCourtIds.length > 0) {
          return { ...prev, courtIds: validCourtIds };
        }
        if (nextCourts.length > 0) {
          return { ...prev, courtIds: [nextCourts[0]._id] };
        }
        return { ...prev, courtIds: [] };
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(REALTIME_CHANNELS.blockedSlots);
    const handleUpdate = () => {
      void loadData();
    };

    channel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.blockedSlots);
    };
  }, []);

  async function handleCreateBlock(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (form.courtIds.length === 0) {
      setError("Please select at least one court");
      return;
    }

    if (form.startTime >= form.endTime) {
      setError("End time must be after start time");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/blocked-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtIds: form.courtIds,
          bookingDate: form.bookingDate,
          startTime: form.startTime,
          endTime: form.endTime,
          reason: form.reason.trim() || undefined,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | {
            error?: { message?: string };
            data?: {
              created?: Array<{ _id: string }>;
              skipped?: Array<{ courtId: string; reason: string }>;
            };
          }
        | null;

      if (!response.ok) {
        const message = body?.error?.message ?? "Failed to create blocked slot";
        if (message === "No blocked slots were created because all selected courts had overlapping blocked ranges") {
          setPopupMessage(message);
          return;
        }

        throw new Error(message);
      }

      setForm((prev) => ({ ...prev, reason: "" }));

      const createdCount = body?.data?.created?.length ?? 0;
      const skippedCount = body?.data?.skipped?.length ?? 0;
      if (createdCount > 0 && skippedCount > 0) {
        setSuccessMessage(`Created ${createdCount} block(s). Skipped ${skippedCount} due to overlap.`);
      } else if (createdCount > 0) {
        setSuccessMessage(`Created ${createdCount} block(s) successfully.`);
      }

      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create blocked slot");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteBlock(id: string): Promise<void> {
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/blocked-slots/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Failed to delete blocked slot");
      }

      setBlockedSlots((prev) => prev.filter((slot) => slot._id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete blocked slot");
    }
  }

  return (
    <div className="w-full" style={{ maxWidth: "1900px" }}>
      {popupMessage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-slate-800">Blocking Notice</h3>
            <p className="mb-4 text-sm text-slate-600">{popupMessage}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPopupMessage(null)}
                className="px-4 py-2 rounded-lg bg-[#1D9E75] text-white text-sm font-semibold hover:bg-[#17876a]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="text-lg font-semibold text-slate-700 mb-3 border-b border-slate-200 pb-2">
        Booking Blocks
        <p className="mt-1 text-sm text-slate-500 font-normal">
          Prevent selected courts from being booked at specific times.
        </p>
      </div>

      <form
        onSubmit={handleCreateBlock}
        className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-5"
      >
        <div className="md:col-span-5 rounded border border-slate-300 bg-white p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Select courts ({form.courtIds.length})</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-2 py-0.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => setForm((prev) => ({ ...prev, courtIds: courts.map((court) => court._id) }))}
              >
                Select all
              </button>
              <button
                type="button"
                className="px-2 py-0.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => setForm((prev) => ({ ...prev, courtIds: [] }))}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid max-h-32 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {courts.map((court) => {
              const checked = form.courtIds.includes(court._id);
              return (
                <label key={court._id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setForm((prev) => ({
                        ...prev,
                        courtIds: isChecked
                          ? [...prev.courtIds, court._id]
                          : prev.courtIds.filter((id) => id !== court._id),
                      }));
                    }}
                  />
                  <span>{court.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        <input
          type="date"
          value={form.bookingDate}
          onChange={(e) => setForm((prev) => ({ ...prev, bookingDate: e.target.value }))}
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          required
        />

        <input
          type="time"
          value={form.startTime}
          onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          required
        />

        <input
          type="time"
          value={form.endTime}
          onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          required
        />

        <input
          type="text"
          value={form.reason}
          onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
          className="rounded border border-slate-300 px-2 py-2 text-sm"
          placeholder="Reason (optional)"
          maxLength={200}
        />

        <button
          type="submit"
          disabled={isSaving || isLoading}
          className="md:col-span-5 rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17876a] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Saving blocks..." : "Add blocked slot(s)"}
        </button>
      </form>

      {isLoading ? (
        <p className="text-[#1D9E75] font-medium mb-4">Loading...</p>
      ) : null}

      {error ? (
        <p className="text-red-600 bg-red-50 rounded-md px-4 py-2 mb-4 font-medium">{error}</p>
      ) : null}

      {successMessage ? (
        <p className="text-green-700 bg-green-50 rounded-md px-4 py-2 mb-4 font-medium">{successMessage}</p>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table className="w-full border-collapse bg-white rounded-xl shadow text-sm" style={{ minWidth: "1100px" }}>
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Court</th>
              <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Date</th>
              <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Start</th>
              <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">End</th>
              <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Reason</th>
              <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Created</th>
              <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && blockedSlots.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center italic text-slate-500">
                  No blocked slots found.
                </td>
              </tr>
            ) : null}
            {blockedSlots.map((slot) => (
              <tr key={slot._id} className="border-b border-slate-200 last:border-b-0">
                <td className="px-2 py-2 text-slate-800 whitespace-nowrap">{courtNameById[slot.courtId] ?? slot.courtId}</td>
                <td className="px-2 py-2 text-slate-800 whitespace-nowrap">{slot.bookingDate}</td>
                <td className="px-2 py-2 text-slate-800 whitespace-nowrap">{formatTime12h(slot.startTime)}</td>
                <td className="px-2 py-2 text-slate-800 whitespace-nowrap">{formatTime12h(slot.endTime)}</td>
                <td className="px-2 py-2 text-slate-800">{slot.reason || "-"}</td>
                <td className="px-2 py-2 text-slate-800 whitespace-nowrap">{new Date(slot.createdAt).toLocaleString()}</td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => void handleDeleteBlock(slot._id)}
                    className="px-2 py-0.5 rounded bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
