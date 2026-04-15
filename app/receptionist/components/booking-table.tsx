// Helper to format time as 12-hour with am/pm
function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const hour = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}
import React, { useEffect, useState, FC } from "react";
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
}

interface BookingActionsProps {
  status: string;
}

const BookingActions: FC<BookingActionsProps> = ({ status }) => {
  if (status === "PENDING") {
    return (
      <div className="flex gap-2">
        <button className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">Approve</button>
        <button className="px-3 py-1 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700">Deny</button>
        <button className="px-3 py-1 rounded bg-slate-400 text-white text-xs font-semibold hover:bg-slate-500">Cancel</button>
      </div>
    );
  }
  if (["CONFIRMED", "PAID", "APPROVED"].includes(status)) {
    return (
      <button className="px-3 py-1 rounded bg-slate-400 text-white text-xs font-semibold hover:bg-slate-500">Cancel</button>
    );
  }
  return null;
};


function statusColor(status: string): string {
  switch (status) {
    case "PENDING": return "#f59e42";
    case "CONFIRMED": return "#2563eb";
    case "PAID": return "#059669";
    case "APPROVED": return "#2563eb";
    case "EXPIRED": return "#64748b";
    case "CANCELLED": return "#dc2626";
    case "DENIED": return "#dc2626";
    default: return "#334155";
  }
}

export const BookingTable: FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const courtNames = useCourtNames();

  useEffect(() => {
    fetch("/api/admin/bookings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bookings");
        return res.json();
      })
      .then((data) => setBookings(data.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto overflow-x-auto">
      {loading && <p className="text-blue-600 font-medium mb-4">Loading...</p>}
      {error && <p className="text-red-600 bg-red-50 rounded-md px-4 py-2 mb-4 font-medium">{error}</p>}
      <table className="w-full border-collapse bg-white rounded-xl shadow text-sm">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="px-4 py-3 font-semibold text-left">Customer</th>
            <th className="px-4 py-3 font-semibold text-left">Contact Number</th>
            <th className="px-4 py-3 font-semibold text-left">Email</th>
            <th className="px-4 py-3 font-semibold text-left">Court</th>
            <th className="px-4 py-3 font-semibold text-left">Date</th>
            <th className="px-4 py-3 font-semibold text-left">Time</th>
            <th className="px-4 py-3 font-semibold text-left">Status</th>
            <th className="px-4 py-3 font-semibold text-left">Payment Ref</th>
            <th className="px-4 py-3 font-semibold text-left">Denial Reason</th>
            <th className="px-4 py-3 font-semibold text-left">Expires At</th>
            <th className="px-4 py-3 font-semibold text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 && !loading && (
            <tr>
              <td colSpan={11} className="text-slate-500 text-center italic py-6">No bookings found.</td>
            </tr>
          )}
          {bookings.map((b) => {
            const customer = typeof b.customer === "object" ? b.customer : { name: b.customer, contactNumber: "-", email: "-" };
            return (
              <tr key={b._id} className="border-b border-slate-200 last:border-b-0">
                <td className="px-2 py-2 text-slate-800">{customer.name}</td>
                  <td className="px-2 py-2 text-slate-800">{customer.contactNumber || "-"}</td>
                  <td className="px-2 py-2 text-slate-800">{customer.email || "-"}</td>
                  <td className="px-2 py-2 text-slate-800">{courtNames[b.courtId] || b.courtId}</td>
                  <td className="px-2 py-2 text-slate-800">{b.bookingDate}</td>
                  <td className="px-2 py-2 text-slate-800">{formatTime12h(b.startTime)} - {formatTime12h(b.endTime)}</td>
                  <td className="px-2 py-2 font-semibold" style={{ color: statusColor(b.status) }}>{b.status}</td>
                  <td className="px-2 py-2 text-slate-800">{b.paymentReference || "-"}</td>
                  <td className="px-2 py-2 text-slate-800">{b.denialReason || "-"}</td>
                  <td className="px-2 py-2 text-slate-800">{new Date(b.expiresAt).toLocaleString()}</td>
                  <td className="px-2 py-2">
                  <BookingActions status={b.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
// statusColor function is already defined above, so remove duplicate/misplaced code.
