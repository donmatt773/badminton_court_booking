"use client";

import React, { useEffect, useState, FC } from "react";
import { blockedSlotRangesOverlap } from "@/lib/shared/blocked-slot-time";

interface Court {
  _id: string;
  name: string;
  surfaceType: string;
  status: string;
}

interface Customer {
  _id: string;
  name: string;
  contactNumber: string;
  email: string;
}

interface WalkInBookingModalProps {
  onClose: () => void;
  onCreated: () => void;
}

type CustomerMode = "existing" | "new";

function localISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export const WalkInBookingModal: FC<WalkInBookingModalProps> = ({ onClose, onCreated }) => {
  const [courts, setCourts] = useState<Court[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [customerMode, setCustomerMode] = useState<CustomerMode>("existing");

  // Existing customer
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // New customer fields
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Booking fields
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);

  function toggleCourt(id: string) {
    setSelectedCourtIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }
  const [bookingDate, setBookingDate] = useState(localISODate());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState("APPROVED");

  // Slot availability
  interface BookingSlot { startTime: string; endTime: string; status: string; }
  interface BlockedSlotItem { startTime: string; endTime: string; }
  const [takenBookings, setTakenBookings] = useState<BookingSlot[]>([]);
  const [takenBlocked, setTakenBlocked] = useState<BlockedSlotItem[]>([]);

  const SLOT_START = 10;
  const SLOT_END = 24;
  const allSlots: string[] = [];
  for (let h = SLOT_START; h < SLOT_END; h++) {
    allSlots.push(`${String(h).padStart(2, "0")}:00`);
  }

  function fmtHour(hhmm: string): string {
    const [h] = hhmm.split(":").map(Number);
    if (isNaN(h)) return hhmm;
    if (h === 24 || h === 0) return "12:00 AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:00 ${h < 12 ? "AM" : "PM"}`;
  }

  function rangesOverlapLocal(sA: string, eA: string, sB: string, eB: string): boolean {
    return blockedSlotRangesOverlap(sA, eA, sB, eB);
  }

  function isSlotTaken(sStart: string, sEnd: string): boolean {
    const activeStatuses = ["PENDING", "CONFIRMED", "PAID", "APPROVED"];
    return (
      takenBookings.some(
        (b) => activeStatuses.includes(b.status) && rangesOverlapLocal(sStart, sEnd, b.startTime, b.endTime)
      ) || takenBlocked.some((b) => rangesOverlapLocal(sStart, sEnd, b.startTime, b.endTime))
    );
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = localISODate();
  const nowTime = currentTimeHHMM();

  useEffect(() => {
    if (selectedCourtIds.length === 0 || !bookingDate) {
      setTakenBookings([]);
      setTakenBlocked([]);
      return;
    }
    async function loadSlots() {
      try {
        const bRes = await fetch("/api/admin/bookings", { credentials: "include" });
        const bData = (await bRes.json()) as { data: (BookingSlot & { courtId: string; bookingDate: string })[] };
        setTakenBookings(
          (bData.data ?? []).filter((b) => selectedCourtIds.includes(b.courtId) && b.bookingDate === bookingDate)
        );
        const blResponses = await Promise.all(
          selectedCourtIds.map((cId) =>
            fetch(`/api/admin/blocked-slots?courtId=${encodeURIComponent(cId)}&bookingDate=${encodeURIComponent(bookingDate)}`, { credentials: "include" })
          )
        );
        const blDataArr = await Promise.all(blResponses.map((r) => r.json())) as { data: (BlockedSlotItem & { courtId: string; bookingDate: string })[] }[];
        setTakenBlocked(blDataArr.flatMap((d) => d.data ?? []));
      } catch {
        // silently ignore; server will validate
      }
    }
    void loadSlots();
  }, [selectedCourtIds, bookingDate]);

  useEffect(() => {
    async function load() {
      setLoadingData(true);
      try {
        const [courtsRes, customersRes] = await Promise.all([
          fetch("/api/admin/courts", { credentials: "include" }),
          fetch("/api/admin/customers", { credentials: "include" }),
        ]);
        const courtsData = (await courtsRes.json()) as { data: Court[] };
        const customersData = (await customersRes.json()) as { data: Customer[] };
        setCourts((courtsData.data ?? []).filter((c) => c.status === "active").sort((a, b) => {
          const numA = parseInt(a.name.replace(/\D/g, '') || '0');
          const numB = parseInt(b.name.replace(/\D/g, '') || '0');
          return numA - numB;
        }));
        setCustomers(customersData.data ?? []);
      } catch {
        setError("Failed to load courts or customers.");
      } finally {
        setLoadingData(false);
      }
    }
    void load();
  }, []);

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.contactNumber.includes(customerSearch)
      )
    : customers;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (selectedCourtIds.length === 0) { setError("Please select at least one court."); return; }
    if (!bookingDate) { setError("Please enter a booking date."); return; }
    if (!startTime || !endTime) { setError("Please enter start and end time."); return; }
    if (bookingDate === today && startTime < nowTime) { setError("Start time cannot be in the past."); return; }
    if (startTime >= endTime) { setError("End time must be after start time."); return; }

    setSaving(true);
    try {
      let customerId = selectedCustomerId;

      if (customerMode === "new") {
        if (!newName.trim() || !newContact.trim() || !newEmail.trim()) {
          setError("Please fill in all customer fields.");
          setSaving(false);
          return;
        }
        const res = await fetch("/api/admin/customers", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim(), contactNumber: newContact.trim(), email: newEmail.trim() }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? `Failed to create customer (${res.status})`);
        }
        const customerBody = (await res.json()) as { data: Customer };
        customerId = customerBody.data._id;
      } else {
        if (!customerId) { setError("Please select a customer."); setSaving(false); return; }
      }

      await Promise.all(
        selectedCourtIds.map(async (cId) => {
          const bookingRes = await fetch("/api/admin/bookings", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customerId, courtId: cId, bookingDate, startTime, endTime, status }),
          });
          if (!bookingRes.ok) {
            const body = await bookingRes.json().catch(() => null) as { error?: { message?: string } } | null;
            throw new Error(body?.error?.message ?? `Failed to create booking (${bookingRes.status})`);
          }
        })
      );

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-sm text-gray-100 outline-none transition placeholder:text-gray-500 focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1F2937] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-gray-100">New Walk-in Booking</h2>
            <p className="text-xs text-gray-500 mt-0.5">Create a booking for a walk-in customer</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loadingData ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 flex flex-col gap-5">

            {/* ── Customer section ── */}
            <div>
              <p className={labelCls}>Customer</p>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setCustomerMode("existing")}
                  className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
                    customerMode === "existing"
                      ? "border-[#10B981] bg-[#10B981] text-white"
                      : "border-gray-700 bg-[#1F2937] text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Existing Customer
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode("new")}
                  className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${
                    customerMode === "new"
                      ? "border-[#10B981] bg-[#10B981] text-white"
                      : "border-gray-700 bg-[#1F2937] text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  New Walk-in Customer
                </button>
              </div>

              {customerMode === "existing" ? (
                <div className="flex flex-col gap-2">
                  <input
                    className={inputCls}
                    placeholder="Search by name or contact…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                  <select
                    className={inputCls}
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">— Select customer —</option>
                    {filteredCustomers.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.contactNumber})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    className={inputCls}
                    placeholder="Full name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <input
                    className={inputCls}
                    placeholder="Contact number"
                    value={newContact}
                    onChange={(e) => setNewContact(e.target.value)}
                  />
                  <input
                    className={inputCls}
                    placeholder="Email (e.g. name@gmail.com)"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* ── Booking details ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Court{selectedCourtIds.length > 1 ? "s" : ""}</label>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {courts.map((c) => (
                    <label
                      key={c._id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition ${
                        selectedCourtIds.includes(c._id)
                          ? "border-[#10B981] bg-[#10B981]/10"
                          : "border-gray-700 bg-[#111827] hover:border-gray-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-[#10B981] w-4 h-4"
                        checked={selectedCourtIds.includes(c._id)}
                        onChange={() => toggleCourt(c._id)}
                      />
                      <span className="text-sm text-gray-100">{c.name}</span>
                      <span className="text-xs text-gray-500 ml-auto">{c.surfaceType}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className={labelCls}>Booking Date</label>
                <input
                  className={inputCls}
                  type="date"
                  min={today}
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                />
              </div>

              <div className="col-span-2">
                <label className={labelCls}>Time Slot (1 hour)</label>
                {selectedCourtIds.length === 0 || !bookingDate ? (
                  <p className="text-xs text-gray-500">Select a court and date first.</p>
                ) : (
                  <>
                    {/* Linear timeline – two rows, IN/OUT range selection */}
                    {([allSlots.slice(0, 7), allSlots.slice(7)] as string[][]).map((rowSlots, rowIdx) => {
                      const rowEndHour = rowIdx === 0 ? SLOT_START + 7 : SLOT_END;
                      return (
                        <div key={rowIdx} className={rowIdx === 0 ? "flex mb-3" : "flex"}>
                          {rowSlots.map((slotStart, idx) => {
                            const slotEnd = `${String(parseInt(slotStart.split(":")[0]) + 1).padStart(2, "0")}:00`;
                            const isPast = bookingDate === today && slotEnd <= nowTime;
                            const isTaken = isSlotTaken(slotStart, slotEnd);
                            const isInRange = !!(startTime && endTime && slotStart >= startTime && slotEnd <= endTime);
                            const isStartSlot = startTime === slotStart;
                            const isEndSlot = endTime === slotEnd;
                            const isDisabled = isPast || isTaken;
                            const isFirst = idx === 0;
                            const isLast = idx === rowSlots.length - 1;
                            return (
                              <button
                                key={slotStart}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => {
                                  if (!startTime || slotStart < startTime) {
                                    setStartTime(slotStart); setEndTime(slotEnd);
                                  } else if (slotStart === startTime) {
                                    setStartTime(""); setEndTime("");
                                  } else if (isSlotTaken(startTime, slotEnd)) {
                                    setStartTime(slotStart); setEndTime(slotEnd);
                                  } else {
                                    setEndTime(slotEnd);
                                  }
                                }}
                                style={{
                                  position: "relative",
                                  flex: 1,
                                  padding: "6px 0 20px",
                                  background: "none",
                                  border: "none",
                                  cursor: isDisabled ? "not-allowed" : "pointer",
                                  opacity: isPast ? 0.4 : 1,
                                }}
                              >
                                <div style={{ fontSize: 9, textAlign: "center", marginBottom: 5, whiteSpace: "nowrap", color: isInRange ? "#6EE7B7" : isTaken ? "#F87171" : "#9CA3AF", fontWeight: isStartSlot || isEndSlot ? 700 : 400 }}>
                                  {fmtHour(slotStart)}
                                </div>
                                {/* track */}
                                <div style={{ height: 6, background: isInRange ? "#10B981" : isTaken ? "rgba(239,68,68,0.45)" : "#374151", borderRadius: isFirst ? "999px 0 0 999px" : isLast ? "0 999px 999px 0" : 0, transition: "background 0.15s" }} />
                                {/* left tick */}
                                <div style={{ position: "absolute", bottom: 10, left: 0, width: 1, height: 8, background: isInRange ? "#10B981" : "#374151" }} />
                                {/* status */}
                                {(isTaken || (isPast && !isTaken)) && (
                                  <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", fontSize: 8, whiteSpace: "nowrap", color: isTaken ? "#F87171" : "#6B7280" }}>
                                    {isTaken ? "Taken" : "Past"}
                                  </div>
                                )}
                                {/* IN indicator */}
                                {isStartSlot && (
                                  <div style={{ position: "absolute", bottom: 0, left: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, zIndex: 2 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 7px rgba(16,185,129,0.8)" }} />
                                    <span style={{ fontSize: 8, color: "#6EE7B7", fontWeight: 800, lineHeight: 1 }}>IN</span>
                                  </div>
                                )}
                                {/* OUT indicator */}
                                {isEndSlot && (
                                  <div style={{ position: "absolute", bottom: 0, right: 0, transform: "translateX(50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, zIndex: 2 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#F59E0B", boxShadow: "0 0 7px rgba(245,158,11,0.8)" }} />
                                    <span style={{ fontSize: 8, color: "#FCD34D", fontWeight: 800, lineHeight: 1 }}>OUT</span>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                          {/* row end label */}
                          <div style={{ flexShrink: 0 }}>
                            <div style={{ fontSize: 9, marginBottom: 5, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                              {fmtHour(`${String(rowEndHour).padStart(2, "0")}:00`)}
                            </div>
                            <div style={{ width: 1, height: 6, background: "#374151" }} />
                          </div>
                        </div>
                      );
                    })}
                    {startTime && (
                      <p className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>
                        <span style={{ color: "#6EE7B7", fontWeight: 700 }}>IN</span> {fmtHour(startTime)}
                        {" – "}
                        <span style={{ color: "#FCD34D", fontWeight: 700 }}>OUT</span> {fmtHour(endTime)}
                        {" · "}
                        <span style={{ color: "#A7F3D0", fontWeight: 700 }}>
                          Duration {Math.max(
                            0,
                            (Number(endTime.split(":")[0]) * 60 + Number(endTime.split(":")[1])) -
                              (Number(startTime.split(":")[0]) * 60 + Number(startTime.split(":")[1]))
                          ) / 60}h
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="col-span-2">
                <label className={labelCls}>Status</label>
                <select
                  className={inputCls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="APPROVED">APPROVED</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="PAID">PAID</option>
                  <option value="PENDING">PENDING</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* ── Actions ── */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-700 bg-[#1F2937] text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-[#10B981] text-white text-sm font-semibold hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Creating…" : "Create Booking"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
