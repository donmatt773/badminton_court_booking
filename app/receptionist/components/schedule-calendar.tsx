import React, { FC, useEffect, useState } from "react";

interface BookingEvent {
  _id: string;
  title: string;
  start: string; // ISO string
  end: string;   // ISO string
  courtName: string;
}

// Helper to get days in current month
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Helper to get the weekday (0=Sun, 6=Sat) of the first day of the month
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export const ScheduleCalendar: FC = () => {
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/bookings")
      .then((res) => res.json())
      .then((data) => {
        const bookings = (data.data || []).map((b: any) => ({
          _id: b._id,
          title: b.customer?.name ? `${b.customer.name} (${b.courtId})` : b.courtId,
          start: b.bookingDate + 'T' + b.startTime,
          end: b.bookingDate + 'T' + b.endTime,
          courtName: b.courtId,
        }));
        setEvents(bookings);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [current]);

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
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300" onClick={prevMonth}>&lt;</button>
        <div className="text-lg font-semibold">{monthNames[current.month]} {current.year}</div>
        <button className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300" onClick={nextMonth}>&gt;</button>
      </div>
      <div className="grid grid-cols-7 gap-1 bg-slate-100 rounded-t-lg">
        {dayNames.map((d) => (
          <div key={d} className="text-center py-2 font-medium text-slate-600">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 bg-white rounded-b-lg border border-slate-200">
        {weeks.flat().map((dayEvents, idx) => {
          const dayNum = idx - firstDay + 1;
          const isToday =
            dayNum === today.getDate() &&
            current.month === today.getMonth() &&
            current.year === today.getFullYear();
          return (
            <div
              key={idx}
              className={`min-h-24 border border-slate-100 p-1 relative ${isToday ? "bg-blue-50 border-blue-400" : ""}`}
            >
              <div className="text-xs font-bold text-slate-700 mb-1">
                {dayNum > 0 && dayNum <= daysInMonth ? dayNum : ""}
              </div>
              {Array.isArray(dayEvents) && dayEvents.length > 0 && (
                <div className="flex flex-col gap-1">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev._id}
                      className="bg-blue-100 text-blue-800 rounded px-1 py-0.5 text-xs truncate"
                      title={`${ev.title} (${ev.start.slice(11,16)}-${ev.end.slice(11,16)})`}
                    >
                      {ev.title} <span className="text-slate-500">{ev.start.slice(11,16)}-{ev.end.slice(11,16)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {loading && <div className="text-blue-600 mt-4">Loading schedules...</div>}
      {error && <div className="text-red-600 mt-4">{error}</div>}
    </div>
  );
};
