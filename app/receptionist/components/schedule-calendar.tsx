import React, { FC, useEffect, useState } from "react";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";
import { useCourtNames } from "./use-court-names";

interface BookingEvent {
  _id: string;
  customerName: string;
  customerEmail: string;
  customerContactNumber: string;
  start: string; // ISO string
  end: string;   // ISO string
  courtId: string;
  status: string;
  paymentReference?: string | null;
  denialReason?: string | null;
  expiresAt?: string | null;
}

type BookingResponse = {
  data?: Array<{
    _id: string;
    customer?: { name?: string; email?: string; contactNumber?: string } | string;
    courtId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    status?: string;
    paymentReference?: string | null;
    denialReason?: string | null;
    expiresAt?: string | null;
  }>;
};

type DaySelection = {
  date: string;
  bookings: BookingEvent[];
};

// Helper to get days in current month
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to get the weekday (0=Sun, 6=Sat) of the first day of the month
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatTime12h(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return value;
  }

  const normalizedHours = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? "AM" : "PM";
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatDisplayDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusClasses(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    case "CONFIRMED":
    case "PAID":
    case "APPROVED":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "EXPIRED":
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    case "CANCELLED":
    case "DENIED":
      return "bg-red-50 text-red-700 ring-1 ring-red-200";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

export const ScheduleCalendar: FC = () => {
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingEvent | null>(null);
  const [current, setCurrent] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const courtNames = useCourtNames();

  async function loadEvents(): Promise<void> {
    setLoading(true);

    try {
      setError(null);
      const res = await fetch("/api/admin/bookings");
      if (!res.ok) {
        throw new Error("Failed to fetch bookings");
      }

      const data = (await res.json()) as BookingResponse;
      const bookings = (data.data || []).map((b) => ({
        _id: b._id,
        customerName:
          typeof b.customer === "object" && b.customer?.name
            ? b.customer.name
            : typeof b.customer === "string"
              ? b.customer
              : b.courtId,
        customerEmail: typeof b.customer === "object" ? b.customer?.email || "-" : "-",
        customerContactNumber: typeof b.customer === "object" ? b.customer?.contactNumber || "-" : "-",
        start: `${b.bookingDate}T${b.startTime}`,
        end: `${b.bookingDate}T${b.endTime}`,
        courtId: b.courtId,
        status: b.status || "UNKNOWN",
        paymentReference: b.paymentReference || null,
        denialReason: b.denialReason || null,
        expiresAt: b.expiresAt || null,
      }));
      setEvents(bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch bookings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, [current]);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(REALTIME_CHANNELS.bookings);
    const handleUpdate = () => {
      void loadEvents();
    };

    channel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
    };
  }, []);

  const daysInMonth = getDaysInMonth(current.year, current.month);
  const firstDay = getFirstDayOfWeek(current.year, current.month);
  const today = new Date();

  // Build calendar grid
  const weeks: (BookingEvent[] | null)[][] = [];
  let day = 1 - firstDay;
  for (let w = 0; w < 6; w++) {
    const week: (BookingEvent[] | null)[] = [];
    for (let d = 0; d < 7; d++, day++) {
      if (day < 1 || day > daysInMonth) {
        week.push(null);
      } else {
        // Find events for this day
        const dateStr = `${current.year}-${String(current.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayEvents = events.filter(e => e.start.startsWith(dateStr));
        week.push(dayEvents);
      }
    }
    weeks.push(week);
  }

  function prevMonth() {
    setCurrent((c) => {
      const m = c.month === 0 ? 11 : c.month - 1;
      const y = c.month === 0 ? c.year - 1 : c.year;
      return { year: y, month: m };
    });
  }
  function nextMonth() {
    setCurrent((c) => {
      const m = c.month === 11 ? 0 : c.month + 1;
      const y = c.month === 11 ? c.year + 1 : c.year;
      return { year: y, month: m };
    });
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <button className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300" onClick={prevMonth}>&lt;</button>
        <div className="text-lg font-semibold">{monthNames[current.month]} {current.year}</div>
        <button className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300" onClick={nextMonth}>&gt;</button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-t-lg" style={{ minWidth: "1200px" }}>
          {dayNames.map((d) => (
            <div key={d} className="text-center py-1 font-medium text-slate-600 text-sm">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-white rounded-b-lg border border-slate-200" style={{ minWidth: "1200px" }}>
          {weeks.flat().map((dayEvents, idx) => {
            const dayNum = idx - firstDay + 1;
            const isCurrentMonthDay = dayNum > 0 && dayNum <= daysInMonth;
            const dateStr = isCurrentMonthDay
              ? `${current.year}-${String(current.month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`
              : "";
            const isToday =
              dayNum === today.getDate() &&
              current.month === today.getMonth() &&
              current.year === today.getFullYear();
            const hasBookings = Array.isArray(dayEvents) && dayEvents.length > 0;
            return (
              <div
                key={idx}
                className={[
                  "min-h-28 border border-slate-100 p-2 relative transition-colors",
                  isCurrentMonthDay ? "bg-white" : "bg-slate-50/70",
                  isToday ? "bg-[#f4f9f7] border-[#1D9E75]" : "",
                  hasBookings ? "hover:bg-[#f7fbf9]" : "",
                ].join(" ")}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-bold text-slate-700">
                    {isCurrentMonthDay ? dayNum : ""}
                  </div>
                  {hasBookings && (
                    <span className="rounded-full bg-[#edf7f2] px-2 py-0.5 text-[10px] font-semibold text-[#1D9E75]">
                      {dayEvents.length}
                    </span>
                  )}
                </div>
                {hasBookings && (
                  <div className="flex flex-col gap-1">
                    {dayEvents.map((ev) => (
                      <button
                        key={ev._id}
                        type="button"
                        className="rounded bg-[#edf7f2] px-2 py-1 text-left text-sm font-medium text-[#0d2418] truncate hover:bg-[#dff1e9] hover:text-[#17876a]"
                        title={ev.customerName}
                        onClick={() => setSelectedBooking(ev)}
                      >
                        {ev.customerName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {loading && <div className="mt-4 text-[#1D9E75]">Loading schedules...</div>}
      {error && <div className="text-red-600 mt-4">{error}</div>}

      {selectedBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setSelectedBooking(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[#e2ede8] bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between rounded-t-2xl border-b border-[#edf7f2] bg-linear-to-r from-[#f9fbfa] to-[#f4f9f7] px-5 py-4">
              <div>
                <div className="text-base font-bold text-[#0d2418]">{selectedBooking.customerName}</div>
                <div className="mt-0.5 text-xs text-[#7aab93]">Booking Details</div>
              </div>
              <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(selectedBooking.status)}`}>
                {selectedBooking.status}
              </span>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg border border-[#d1e0d8] bg-white px-3 py-2 text-sm font-semibold text-[#3b6b53] hover:bg-[#f4f7f6]"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">Date</div>
                  <div className="mt-1 text-[#0d2418]">{formatDisplayDate(selectedBooking.start.slice(0, 10))}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">Time</div>
                  <div className="mt-1 text-[#0d2418]">
                    {formatTime12h(selectedBooking.start.slice(11, 16))} - {formatTime12h(selectedBooking.end.slice(11, 16))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">Court</div>
                  <div className="mt-1 text-[#0d2418]">{courtNames[selectedBooking.courtId] || selectedBooking.courtId}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">Booking ID</div>
                  <div className="mt-1 text-[#0d2418]">{selectedBooking._id}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">Contact</div>
                  <div className="mt-1 text-[#0d2418]">{selectedBooking.customerContactNumber}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">Email</div>
                  <div className="mt-1 break-all text-[#0d2418]">{selectedBooking.customerEmail}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">Payment Ref</div>
                  <div className="mt-1 text-[#0d2418]">{selectedBooking.paymentReference || "-"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-[#7aab93]">Expires At</div>
                  <div className="mt-1 text-[#0d2418]">
                    {selectedBooking.expiresAt ? new Date(selectedBooking.expiresAt).toLocaleString() : "-"}
                  </div>
                </div>
              </div>

              {selectedBooking.denialReason && (
                <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="font-semibold">Denial reason:</span> {selectedBooking.denialReason}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
