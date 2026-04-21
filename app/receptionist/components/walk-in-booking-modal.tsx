"use client";

import React, { useEffect, useState, FC } from "react";

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
  const [courtId, setCourtId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [status, setStatus] = useState("APPROVED");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = localISODate();
  const nowTime = currentTimeHHMM();

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
        setCourts((courtsData.data ?? []).filter((c) => c.status === "active"));
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

    if (!courtId) { setError("Please select a court."); return; }
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

      const bookingRes = await fetch("/api/admin/bookings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, courtId, bookingDate, startTime, endTime, status }),
      });
      if (!bookingRes.ok) {
        const body = await bookingRes.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Failed to create booking (${bookingRes.status})`);
      }

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
                <label className={labelCls}>Court</label>
                <select
                  className={inputCls}
                  value={courtId}
                  onChange={(e) => setCourtId(e.target.value)}
                >
                  <option value="">— Select court —</option>
                  {courts.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.surfaceType})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className={labelCls}>Booking Date</label>
                <input
                  className={inputCls}
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>Start Time</label>
                <input
                  className={inputCls}
                  type="time"
                  value={startTime}
                  min={bookingDate === today ? nowTime : undefined}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>

              <div>
                <label className={labelCls}>End Time</label>
                <input
                  className={inputCls}
                  type="time"
                  value={endTime}
                  min={bookingDate === today ? (startTime > nowTime ? startTime : nowTime) : startTime || undefined}
                  onChange={(e) => setEndTime(e.target.value)}
                />
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
