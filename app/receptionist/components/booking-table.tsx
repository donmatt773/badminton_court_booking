// Helper to format time as 12-hour with am/pm
function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const hour = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}
import React, { useEffect, useState, FC } from "react";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";
import { useCourtNames } from "./use-court-names";

// Booking type based on your Booking model
export interface Booking {
  _id: string;
  customer: { name: string; email: string; contactNumber: string } | string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentReference?: string | null;
  denialReason?: string | null;
  expiresAt: string;
  createdAt?: string;
}

function statusColor(status: string): string {
  switch (status) {
    case "PENDING": return "#92600a";
    case "CONFIRMED": return "#1D9E75";
    case "PAID": return "#1D9E75";
    case "APPROVED": return "#1D9E75";
    case "EXPIRED": return "#64748b";
    case "CANCELLED": return "#dc2626";
    case "DENIED": return "#dc2626";
    default: return "#334155";
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "PENDING": return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    case "CONFIRMED":
    case "PAID":
    case "APPROVED": return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "EXPIRED":
    case "CANCELLED":
    case "DENIED": return "bg-red-50 text-red-700 ring-1 ring-red-200";
    default: return "bg-slate-100 text-slate-700";
  }
}

interface BookingDetailModalProps {
  booking: Booking;
  courtName: string;
  busy: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onCancel: (id: string) => void;
}

const BookingDetailModal: FC<BookingDetailModalProps> = ({
  booking,
  courtName,
  busy,
  onClose,
  onApprove,
  onDeny,
  onCancel,
}) => {
  const customer =
    typeof booking.customer === "object"
      ? booking.customer
      : { name: booking.customer, contactNumber: "-", email: "-" };

  const canApprove = booking.status === "PENDING";
  const canDeny = booking.status === "PENDING";
  const canCancel = ["PENDING", "CONFIRMED", "PAID", "APPROVED"].includes(booking.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#e2ede8] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-[#edf7f2] bg-linear-to-r from-[#f9fbfa] to-[#f4f9f7] px-5 py-4 rounded-t-2xl">
          <div>
            <div className="text-base font-bold text-[#0d2418]">{customer.name}</div>
            <div className="text-xs text-[#7aab93] mt-0.5">Booking Details</div>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBg(booking.status)}`}>
            {booking.status}
          </span>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4">
          {[
            ["Contact", customer.contactNumber || "-"],
            ["Email", customer.email || "-"],
            ["Court", courtName],
            ["Date", booking.bookingDate],
            ["Time", `${formatTime12h(booking.startTime)} – ${formatTime12h(booking.endTime)}`],
            ["Created At", booking.createdAt ? new Date(booking.createdAt).toLocaleString() : "-"],
            ["Payment Ref", booking.paymentReference || "-"],
            ["Denial Reason", booking.denialReason || "-"],
            ["Expires At", new Date(booking.expiresAt).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">{label}</div>
              <div className="mt-0.5 text-sm text-[#0d2418] wrap-break-word">{value}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between border-t border-[#edf7f2] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#d1e0d8] bg-white px-4 py-2 text-sm font-semibold text-[#3b6b53] hover:bg-[#f4f7f6]"
          >
            Close
          </button>
          <div className="flex gap-2">
            {canApprove && (
              <button
                disabled={busy}
                onClick={() => onApprove(booking._id)}
                className="rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17876a] disabled:opacity-50"
              >
                Approve
              </button>
            )}
            {canDeny && (
              <button
                disabled={busy}
                onClick={() => onDeny(booking._id)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Deny
              </button>
            )}
            {canCancel && (
              <button
                disabled={busy}
                onClick={() => onCancel(booking._id)}
                className="rounded-lg bg-slate-400 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-500 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const BookingTable: FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const courtNames = useCourtNames();

  async function loadBookings(): Promise<void> {
    try {
      setError(null);
      const res = await fetch("/api/admin/bookings");
      if (!res.ok) throw new Error("Failed to fetch bookings");
      const data = (await res.json()) as { data?: Booking[] };
      setBookings(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch bookings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBookings();
  }, []);

  async function updateBooking(id: string, body: Record<string, unknown>): Promise<void> {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        setError(json.error?.message ?? "Action failed");
      } else {
        setSelectedBooking(null);
        await loadBookings();
      }
    } catch {
      setError("Network error");
    } finally {
      setBusyId(null);
    }
  }

  function handleApprove(id: string): void {
    void updateBooking(id, { status: "APPROVED" });
  }

  function handleDeny(id: string): void {
    const reason = window.prompt("Enter denial reason (required):");
    if (!reason?.trim()) return;
    void updateBooking(id, { status: "DENIED", denialReason: reason.trim(), confirmDenied: true });
  }

  function handleCancel(id: string): void {
    if (!window.confirm("Cancel this booking?")) return;
    void updateBooking(id, { status: "CANCELLED" });
  }

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(REALTIME_CHANNELS.bookings);
    const handleUpdate = () => { void loadBookings(); };
    channel.bind(REALTIME_EVENTS.updated, handleUpdate);
    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
    };
  }, []);

  return (
    <div className="w-full">
      {loading && <p className="text-[#1D9E75] font-medium mb-4">Loading...</p>}
      {error && <p className="text-red-600 bg-red-50 rounded-md px-4 py-2 mb-4 font-medium">{error}</p>}

      <table className="w-full border-collapse bg-white rounded-xl shadow text-sm">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="px-3 py-2.5 font-semibold text-left whitespace-nowrap">Customer</th>
            <th className="px-3 py-2.5 font-semibold text-left whitespace-nowrap">Court</th>
            <th className="px-3 py-2.5 font-semibold text-left whitespace-nowrap">Date</th>
            <th className="px-3 py-2.5 font-semibold text-left whitespace-nowrap">Time</th>
            <th className="px-3 py-2.5 font-semibold text-left whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 && !loading && (
            <tr>
              <td colSpan={5} className="text-slate-500 text-center italic py-6">No bookings found.</td>
            </tr>
          )}
          {bookings.map((b) => {
            const customer = typeof b.customer === "object" ? b.customer : { name: b.customer, contactNumber: "-", email: "-" };
            return (
              <tr
                key={b._id}
                className="border-b border-slate-200 last:border-b-0 hover:bg-[#f4f9f7] cursor-pointer transition-colors"
                onClick={() => setSelectedBooking(b)}
              >
                <td className="px-3 py-2.5 font-medium text-[#1D9E75] hover:underline whitespace-nowrap">
                  {customer.name}
                </td>
                <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                  {courtNames[b.courtId] || b.courtId}
                </td>
                <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{b.bookingDate}</td>
                <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                  {formatTime12h(b.startTime)} – {formatTime12h(b.endTime)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBg(b.status)}`}
                  >
                    {b.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          courtName={courtNames[selectedBooking.courtId] || selectedBooking.courtId}
          busy={busyId === selectedBooking._id}
          onClose={() => setSelectedBooking(null)}
          onApprove={handleApprove}
          onDeny={handleDeny}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
};
