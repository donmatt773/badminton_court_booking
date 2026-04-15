import React, { FC, useState } from "react";

interface Booking {
  _id: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  customer: { name: string } | string;
}

interface CourtScheduleModalProps {
  courtId: string;
  courtName: string;
  open: boolean;
  onClose: () => void;
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const hour = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export const CourtScheduleModal: FC<CourtScheduleModalProps> = ({ courtId, courtName, open, onClose }) => {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/admin/bookings")
      .then((res) => res.json())
      .then((data) => {
        const filtered = (data.data || []).filter((b: any) => b.courtId === courtId);
        setBookings(filtered);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, courtId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg relative">
        <button className="absolute top-2 right-2 text-slate-500 hover:text-slate-700" onClick={onClose}>&times;</button>
        <div className="text-lg font-bold mb-4">Schedule for {courtName}</div>
        {loading && <div className="text-blue-600">Loading...</div>}
        {error && <div className="text-red-600">{error}</div>}
        {bookings && bookings.length === 0 && <div className="text-slate-500 italic">No bookings for this court.</div>}
        {bookings && bookings.length > 0 && (
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Time</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Customer</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-2 py-2">{b.bookingDate}</td>
                  <td className="px-2 py-2">{formatTime12h(b.startTime)} - {formatTime12h(b.endTime)}</td>
                  <td className="px-2 py-2">{b.status}</td>
                  <td className="px-2 py-2">{typeof b.customer === "object" ? b.customer.name : b.customer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
