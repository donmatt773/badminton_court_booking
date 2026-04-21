import React, { FC, useState } from "react";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";

interface Booking {
  _id: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  courtId: string;
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

  async function loadBookings(): Promise<void> {
    if (!open) {
      return;
    }

    setLoading(true);

    try {
      setError(null);
      const res = await fetch("/api/admin/bookings", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch bookings");
      }

      const data = (await res.json()) as { data?: Booking[] };
      const filtered = (data.data || []).filter((booking) => booking.courtId === courtId);
      setBookings(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch bookings");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadBookings();
  }, [open, courtId]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(REALTIME_CHANNELS.bookings);
    const handleUpdate = () => {
      void loadBookings();
    };

    channel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
    };
  }, [open, courtId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[#111827] border border-gray-700 rounded-xl shadow-xl p-6 w-full max-w-lg relative">
        <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-200 text-xl leading-none" onClick={onClose}>&times;</button>
        <div className="text-lg font-bold mb-4 text-gray-100">Schedule for {courtName}</div>
        {loading && <div className="text-emerald-500 text-sm">Loading...</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {bookings && bookings.length === 0 && <div className="text-gray-500 italic text-sm">No bookings for this court.</div>}
        {bookings && bookings.length > 0 && (
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="bg-[#0B0F1A] text-gray-400">
                <th className="px-2 py-2 text-left font-semibold">Date</th>
                <th className="px-2 py-2 text-left font-semibold">Time</th>
                <th className="px-2 py-2 text-left font-semibold">Status</th>
                <th className="px-2 py-2 text-left font-semibold">Customer</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id} className="border-b border-gray-700 last:border-b-0 text-gray-300">
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
