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
  source: "booking" | "blocked";
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

type BlockedSlotResponse = {
  data?: Array<{
    _id: string;
    courtId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    groupName?: string | null;
    groupRepresentative?: string | null;
    reason?: string | null;
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
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30";
    case "CONFIRMED":
    case "PAID":
    case "APPROVED":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30";
    case "EXPIRED":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-500/30";
    case "CANCELLED":
    case "DENIED":
      return "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/30";
    case "BLOCKED":
      return "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-500/20 dark:text-slate-200 dark:ring-slate-500/30";
  }
}

export const ScheduleCalendar: FC = () => {
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DaySelection | null>(null);
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
      const [bookingsRes, blockedRes] = await Promise.all([
        fetch("/api/admin/bookings", { credentials: "include" }),
        fetch("/api/admin/blocked-slots", { credentials: "include" }),
      ]);

      if (!bookingsRes.ok) {
        throw new Error("Failed to fetch bookings");
      }

      if (!blockedRes.ok) {
        throw new Error("Failed to fetch blocked slots");
      }

      const bookingData = (await bookingsRes.json()) as BookingResponse;
      const blockedData = (await blockedRes.json()) as BlockedSlotResponse;

      const bookings: BookingEvent[] = (bookingData.data || []).map((b) => ({
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
        source: "booking",
        paymentReference: b.paymentReference || null,
        denialReason: b.denialReason || null,
        expiresAt: b.expiresAt || null,
      }));

      const blockedSlots: BookingEvent[] = (blockedData.data || []).map((slot) => ({
        _id: `blocked-${slot._id}`,
        customerName: slot.groupName?.trim() || "Blocked Slot",
        customerEmail: "-",
        customerContactNumber: slot.groupRepresentative?.trim() || "-",
        start: `${slot.bookingDate}T${slot.startTime}`,
        end: `${slot.bookingDate}T${slot.endTime}`,
        courtId: slot.courtId,
        status: "BLOCKED",
        source: "blocked",
        paymentReference: slot.reason || null,
        denialReason: null,
        expiresAt: null,
      }));

      setEvents([...bookings, ...blockedSlots]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch schedules");
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
    const blockedChannel = pusher.subscribe(REALTIME_CHANNELS.blockedSlots);
    const handleUpdate = () => {
      void loadEvents();
    };

    channel.bind(REALTIME_EVENTS.updated, handleUpdate);
    blockedChannel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      blockedChannel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
      pusher.unsubscribe(REALTIME_CHANNELS.blockedSlots);
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
        <button className="px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-sm dark:bg-[#1F2937] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-[#263041]" onClick={prevMonth}>&lt;</button>
        <div className="text-base font-semibold text-gray-200">{monthNames[current.month]} {current.year}</div>
        <button className="px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-sm dark:bg-[#1F2937] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-[#263041]" onClick={nextMonth}>&gt;</button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-px bg-[#0B0F1A] rounded-t-lg">
          {dayNames.map((d) => (
            <div key={d} className="text-center py-1.5 font-semibold text-gray-400 text-xs uppercase tracking-wide">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-[#1F2937] rounded-b-lg border border-gray-700">
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
                  "min-h-16 border border-gray-700/60 p-1 relative transition-colors",
                  isCurrentMonthDay ? "bg-[#1F2937]" : "bg-[#161d29]",
                  isToday ? "bg-[#0f2a1e]! border-[#10B981]!" : "",
                  hasBookings && !isToday ? "hover:bg-[#263041]" : "",
                ].join(" ")}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className={`text-xs font-bold ${isToday ? "text-[#10B981]" : "text-gray-300"}`}>
                    {isCurrentMonthDay ? dayNum : ""}
                  </div>
                  {hasBookings && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-semibold text-emerald-800 dark:bg-[#1E3A5F] dark:text-[#10B981]">
                      {dayEvents.length}
                    </span>
                  )}
                </div>
                {hasBookings && (
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <button
                        key={ev._id}
                        type="button"
                        className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${
                          ev.source === "blocked"
                            ? "bg-indigo-100 text-indigo-900 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                            : "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-[#1E3A5F] dark:text-[#E2E8F0] dark:hover:bg-emerald-900/40 dark:hover:text-[#059669]"
                        }`}
                        title={ev.customerName}
                        onClick={() => setSelectedBooking(ev)}
                      >
                        {ev.customerName.split(" ")[0]}
                      </button>
                    ))}
                    {dayEvents.length > 2 && (
                      <button
                        type="button"
                        className="pl-1 text-left text-[9px] text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                        onClick={() => setSelectedDay({ date: dateStr, bookings: dayEvents })}
                      >
                        +{dayEvents.length - 2} more
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {loading && <div className="mt-4 text-[#10B981]">Loading schedules...</div>}
      {error && <div className="text-red-600 mt-4">{error}</div>}

      {selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-gray-700 bg-[#111827] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between rounded-t-2xl border-b border-gray-700 bg-[#0B0F1A] px-5 py-4">
              <div>
                <div className="text-base font-bold text-[#E2E8F0]">Bookings for {formatDisplayDate(selectedDay.date)}</div>
                <div className="mt-0.5 text-xs text-gray-400">Select a customer to view full details</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-[#1F2937] dark:text-gray-300 dark:hover:bg-[#263041]"
              >
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {selectedDay.bookings
                  .slice()
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .map((booking) => (
                    <button
                      key={booking._id}
                      type="button"
                      onClick={() => {
                        setSelectedDay(null);
                        setSelectedBooking(booking);
                      }}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-left transition hover:border-emerald-500/40 hover:bg-emerald-50 dark:border-gray-700 dark:bg-[#1F2937] dark:hover:border-emerald-600/40 dark:hover:bg-[#263041]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-100">{booking.customerName}</div>
                          <div className="text-xs text-gray-400">
                            {formatTime12h(booking.start.slice(11, 16))} - {formatTime12h(booking.end.slice(11, 16))}
                          </div>
                        </div>
                        <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusClasses(booking.status)}`}>
                          {booking.status}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setSelectedBooking(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-[#111827] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between rounded-t-2xl border-b border-gray-700 bg-[#0B0F1A] px-5 py-4">
              <div>
                <div className="text-base font-bold text-[#E2E8F0]">{selectedBooking.customerName}</div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {selectedBooking.source === "blocked" ? "Blocked Slot Details" : "Booking Details"}
                </div>
              </div>
              <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(selectedBooking.status)}`}>
                {selectedBooking.status}
              </span>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-[#1F2937] dark:text-gray-300 dark:hover:bg-[#263041]"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="grid grid-cols-1 gap-3 text-sm text-gray-200 md:grid-cols-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Date</div>
                  <div className="mt-1 text-[#E2E8F0]">{formatDisplayDate(selectedBooking.start.slice(0, 10))}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Time</div>
                  <div className="mt-1 text-[#E2E8F0]">
                    {formatTime12h(selectedBooking.start.slice(11, 16))} - {formatTime12h(selectedBooking.end.slice(11, 16))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Court</div>
                  <div className="mt-1 text-[#E2E8F0]">{courtNames[selectedBooking.courtId] || selectedBooking.courtId}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {selectedBooking.source === "blocked" ? "Representative" : "Contact"}
                  </div>
                  <div className="mt-1 text-[#E2E8F0]">{selectedBooking.customerContactNumber}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {selectedBooking.source === "blocked" ? "Type" : "Email"}
                  </div>
                  <div className="mt-1 break-all text-[#E2E8F0]">
                    {selectedBooking.source === "blocked" ? "Blocked Slot" : selectedBooking.customerEmail}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {selectedBooking.source === "blocked" ? "Reason" : "Payment Ref"}
                  </div>
                  <div className="mt-1 text-[#E2E8F0]">{selectedBooking.paymentReference || "-"}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Expires At</div>
                  <div className="mt-1 text-[#E2E8F0]">
                    {selectedBooking.source === "blocked"
                      ? "-"
                      : selectedBooking.expiresAt
                        ? new Date(selectedBooking.expiresAt).toLocaleString()
                        : "-"}
                  </div>
                </div>
              </div>

              {selectedBooking.denialReason && (
                <div className="mt-4 rounded-lg border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-300">
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
