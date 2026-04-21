"use client";

import { gql } from "@apollo/client";
import { useMutation, useQuery } from "@apollo/client/react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";

type Court = {
  id: string;
  name: string;
  surfaceType: "wooden" | "rubber";
  status: "active" | "inactive" | "maintenance";
};

type Booking = {
  id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "PAID"
    | "APPROVED"
    | "EXPIRED"
    | "CANCELLED"
    | "DENIED";
};

type BlockedSlot = {
  id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
};

type BookingInput = {
  name: string;
  contactNumber: string;
  email: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
};

type LastSubmitted = {
  email: string;
  bookingDate: string;
  bookingId: string;
};

// ---------------------------------------------------------------------------
// Time configuration
// ---------------------------------------------------------------------------
const SLOT_START_HOUR = 8;   // 8:00 AM
const SLOT_END_HOUR   = 22;  // 10:00 PM

/** All selectable hours as "HH:00" strings */
function generateHours(): string[] {
  const hours: string[] = [];
  for (let h = SLOT_START_HOUR; h <= SLOT_END_HOUR; h++) {
    hours.push(`${String(h).padStart(2, "0")}:00`);
  }
  return hours;
}

const ALL_HOURS = generateHours();
// Alias kept for court-card dot counting
const ALL_SLOTS = ALL_HOURS.slice(0, -1); // start hours only (8-21)

function formatHour(hhmm: string): string {
  const [h] = hhmm.split(":").map(Number);
  if (isNaN(h)) return hhmm;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:00 ${h < 12 ? "AM" : "PM"}`;
}

function addHour(hhmm: string, delta = 1): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(h + delta).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

// ---------------------------------------------------------------------------
// GraphQL helpers
// ---------------------------------------------------------------------------
const COURTS_AND_BOOKINGS_QUERY = gql`
  query CourtsAndBookings($bookingDate: String) {
    courts {
      id
      name
      surfaceType
      status
    }
    bookings(bookingDate: $bookingDate) {
      id
      courtId
      bookingDate
      startTime
      endTime
      status
    }
    blockedSlots(bookingDate: $bookingDate) {
      id
      courtId
      bookingDate
      startTime
      endTime
      reason
    }
  }
`;

const CREATE_BOOKING_MUTATION = gql`
  mutation CreateBooking($input: CreateBookingInput!) {
    createBooking(input: $input) {
      id
      status
      bookingDate
      startTime
      endTime
      courtId
    }
  }
`;

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Dot strip showing slot occupancy at a glance */
function SlotDots({ total, taken }: { total: number; taken: number }) {
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", margin: "8px 0 12px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            display: "block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: i < taken ? "#E24B4A" : "#1D9E75",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}



// ---------------------------------------------------------------------------
// CalendarPicker sub-component
// ---------------------------------------------------------------------------
function CalendarPicker({
  selected,
  minDate,
  onSelect,
}: {
  selected: string;
  minDate: string;
  onSelect: (date: string) => void;
}) {
  const today = new Date();
  const initDate = selected ? new Date(selected + "T00:00:00") : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const canGoPrev = viewYear > todayY || (viewYear === todayY && viewMonth > todayM);
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    if (!canGoPrev) return;
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          style={{
            background: "none", border: "1px solid var(--color-border-secondary)",
            borderRadius: 6, width: 28, height: 28,
            cursor: canGoPrev ? "pointer" : "not-allowed",
            fontSize: 16, color: canGoPrev ? "var(--color-text-primary)" : "#ccc",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          style={{
            background: "none", border: "1px solid var(--color-border-secondary)",
            borderRadius: 6, width: 28, height: 28, cursor: "pointer",
            fontSize: 16, color: "var(--color-text-primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>
        {DAY_LABELS.map((d) => (
          <span key={d} style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", padding: "2px 0" }}>
            {d}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((day, idx) => {
          if (!day) return <span key={idx} />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isPast = dateStr < minDate;
          const isSelected = dateStr === selected;
          const isToday = dateStr === todayISODate();
          return (
            <button
              key={idx}
              type="button"
              disabled={isPast}
              onClick={() => !isPast && onSelect(dateStr)}
              style={{
                padding: "7px 2px",
                fontSize: 12,
                textAlign: "center",
                borderRadius: 6,
                border: isToday && !isSelected ? "1px solid #1D9E75" : "1px solid transparent",
                background: isSelected ? "#1D9E75" : "transparent",
                color: isSelected ? "#fff" : isPast ? "#d0d0d0" : "var(--color-text-primary)",
                cursor: isPast ? "default" : "pointer",
                fontWeight: isSelected || isToday ? 600 : 400,
                transition: "background 0.1s",
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimelinePicker sub-component
// ---------------------------------------------------------------------------
function formatHourShort(hhmm: string): string {
  const [h] = hhmm.split(":").map(Number);
  if (isNaN(h)) return hhmm;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${h < 12 ? "a" : "p"}`;
}

function TimelinePicker({
  startTime,
  endTime,
  activeBookings,
  blockedRanges,
  onChange,
}: {
  startTime: string;
  endTime: string;
  activeBookings: Array<{ startTime: string; endTime: string }>;
  blockedRanges: Array<{ startTime: string; endTime: string }>;
  onChange: (start: string, end: string) => void;
}) {
  function handleClick(hour: string) {
    const next = addHour(hour);
    if (activeBookings.some((b) => rangesOverlap(hour, next, b.startTime, b.endTime))) return;
    if (blockedRanges.some((b) => rangesOverlap(hour, next, b.startTime, b.endTime))) return;
    if (!startTime || (startTime && endTime)) {
      onChange(hour, "");
    } else if (hour <= startTime) {
      onChange(hour, "");
    } else {
      onChange(startTime, addHour(hour));
    }
  }

  function getSegmentState(hour: string): "booked" | "blocked" | "selected" | "pending-start" | "available" {
    const next = addHour(hour);
    if (activeBookings.some((b) => rangesOverlap(hour, next, b.startTime, b.endTime))) return "booked";
    if (blockedRanges.some((b) => rangesOverlap(hour, next, b.startTime, b.endTime))) return "blocked";
    if (startTime && !endTime && hour === startTime) return "pending-start";
    if (startTime && endTime && hour >= startTime && next <= endTime) return "selected";
    return "available";
  }

  return (
    <div>
      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border-secondary)" }}>
        {ALL_SLOTS.map((hour, i) => {
          const state = getSegmentState(hour);
          const isUnavailable = state === "booked" || state === "blocked";
          const isActive = state === "selected" || state === "pending-start";
          return (
            <button
              key={hour}
              type="button"
              disabled={isUnavailable}
              title={`${formatHour(hour)}${state === "booked" ? " · booked" : state === "blocked" ? " · blocked" : ""}`}
              onClick={() => handleClick(hour)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "10px 0",
                background: isActive ? "#1D9E75" : state === "booked" ? "#FDE7E7" : state === "blocked" ? "#FFF4E0" : "#f8faf9",
                color: isActive ? "#ffffff" : state === "booked" ? "#8F2D2D" : state === "blocked" ? "#8A5208" : "var(--color-text-secondary)",
                border: "none",
                borderLeft: i > 0 ? "1px solid rgba(0,0,0,0.07)" : "none",
                cursor: isUnavailable ? "not-allowed" : "pointer",
                fontSize: 9,
                textAlign: "center",
                fontWeight: isActive ? 600 : 400,
                textDecoration: isUnavailable ? "line-through" : "none",
                transition: "background 0.1s",
                overflow: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              {formatHourShort(hour)}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--color-text-secondary)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, background: "#FDE7E7", border: "1px solid #F3B4B4", borderRadius: 2, display: "inline-block" }} />
            Booked
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, background: "#FFF4E0", border: "1px dashed #EAB773", borderRadius: 2, display: "inline-block" }} />
            Blocked
          </span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: startTime ? "#0F6E56" : "var(--color-text-secondary)" }}>
          {!startTime
            ? "Click a segment to set start"
            : !endTime
            ? `${formatHour(startTime)} — click to set end`
            : `${formatHour(startTime)} – ${formatHour(endTime)}`}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function BookingExperience() {
  const [submissionErrorMessage, setSubmissionErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [lastSubmitted, setLastSubmitted] = useState<LastSubmitted | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState<BookingInput>({
    name: "",
    contactNumber: "",
    email: "",
    courtId: "",
    bookingDate: todayISODate(),
    startTime: "",
    endTime: "",
  });

  const {
    data,
    loading: isLoading,
    error: queryError,
    refetch,
  } = useQuery<{
    courts: Court[];
    bookings: Booking[];
    blockedSlots: BlockedSlot[];
  }>(COURTS_AND_BOOKINGS_QUERY, {
    variables: {
      bookingDate: form.bookingDate,
    },
  });

  const [createBooking, { loading: isSubmitting }] = useMutation<{
    createBooking: Booking;
  }>(CREATE_BOOKING_MUTATION);

  const courts = data?.courts ?? [];
  const bookings = data?.bookings ?? [];
  const blockedSlots = data?.blockedSlots ?? [];
  const errorMessage = submissionErrorMessage || (queryError?.message ?? "");

  // Active bookings for the selected court (for overlap validation)
  const activeBookingsForCourt = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.courtId === form.courtId &&
          !['EXPIRED', 'CANCELLED', 'DENIED'].includes(b.status)
      ),
    [bookings, form.courtId]
  );

  // Blocked slots for the selected court
  const courtBlockedSlots = useMemo(
    () => blockedSlots.filter((s) => s.courtId === form.courtId),
    [blockedSlots, form.courtId]
  );

  // Check if a proposed start/end overlaps any booking or blocked slot
  function hasConflict(start: string, end: string): boolean {
    if (!start || !end || start >= end) return false;
    return (
      activeBookingsForCourt.some((b) => rangesOverlap(start, end, b.startTime, b.endTime)) ||
      courtBlockedSlots.some((b) => rangesOverlap(start, end, b.startTime, b.endTime))
    );
  }

  const selectedCourt = useMemo(
    () => courts.find((c) => c.id === form.courtId) ?? null,
    [courts, form.courtId]
  );

  const trackingParams = useMemo(() => {
    if (!lastSubmitted) return "";
    return new URLSearchParams({
      email: lastSubmitted.email,
      date: lastSubmitted.bookingDate,
      bookingId: lastSubmitted.bookingId,
    }).toString();
  }, [lastSubmitted]);

  useEffect(() => {
    setForm((prev) => {
      const hasCurrentCourt = courts.some((court) => court.id === prev.courtId);
      if (hasCurrentCourt || courts.length === 0) {
        return prev;
      }

      return { ...prev, courtId: courts[0].id };
    });
  }, [courts]);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const bookingChannel = pusher.subscribe(REALTIME_CHANNELS.bookings);
    const blockedSlotChannel = pusher.subscribe(REALTIME_CHANNELS.blockedSlots);
    const courtsChannel = pusher.subscribe(REALTIME_CHANNELS.courts);
    const handleUpdate = () => {
      void refetch();
    };

    bookingChannel.bind(REALTIME_EVENTS.updated, handleUpdate);
    blockedSlotChannel.bind(REALTIME_EVENTS.updated, handleUpdate);
    courtsChannel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      bookingChannel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      blockedSlotChannel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      courtsChannel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
      pusher.unsubscribe(REALTIME_CHANNELS.blockedSlots);
      pusher.unsubscribe(REALTIME_CHANNELS.courts);
    };
  }, [refetch]);

  // Close modal on Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsModalOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isModalOpen]);

  // -------------------------------------------------------------------------
  function openModal(courtId: string) {
    setForm((prev) => ({ ...prev, courtId, startTime: "", endTime: "" }));
    setStatusMessage("");
    setSubmissionErrorMessage("");
    setIsModalOpen(true);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!form.startTime || !form.endTime) {
      setSubmissionErrorMessage("Please select both a time in and time out.");
      return;
    }
    if (form.startTime >= form.endTime) {
      setSubmissionErrorMessage("Time out must be after time in.");
      return;
    }
    if (hasConflict(form.startTime, form.endTime)) {
      setSubmissionErrorMessage("That time range overlaps an existing booking or blocked slot. Please choose a different time.");
      return;
    }
    setSubmissionErrorMessage("");
    setStatusMessage("");
    try {
      const result = await createBooking({
        variables: { input: form },
      });
      const createdBooking = result.data?.createBooking;
      if (!createdBooking) {
        throw new Error("Booking could not be submitted.");
      }
      setStatusMessage("Reservation submitted! Your slot is pending admin approval.");
      setLastSubmitted({ email: form.email, bookingDate: form.bookingDate, bookingId: createdBooking.id });
      setIsModalOpen(false);
      await refetch();
    } catch (error) {
      setSubmissionErrorMessage(getErrorMessage(error, "Booking could not be submitted."));
    }
  }

  // -------------------------------------------------------------------------
  // Shared style snippets
  // -------------------------------------------------------------------------
  const inputStyle: React.CSSProperties = {
    height: 40,
    width: "100%",
    boxSizing: "border-box",
    padding: "0 10px",
    fontSize: 13,
    color: "var(--color-text-primary)",
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-secondary)",
    borderRadius: "var(--border-radius-md)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 4,
    fontSize: 12,
    color: "var(--color-text-secondary)",
  };

  // -------------------------------------------------------------------------
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(ellipse 90% 55% at 70% -5%, rgba(29,158,117,0.13) 0%, transparent 55%)," +
          "radial-gradient(ellipse 60% 45% at -5% 55%, rgba(29,158,117,0.09) 0%, transparent 50%)," +
          "#f6fbf8",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── NAV ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 24px",
          background: "#1D9E75",
          borderBottom: "1px solid #17876a",
          boxShadow: "0 2px 12px rgba(13,100,68,0.18)",
        }}
      >
        <a href="#home" style={{ display: "inline-flex" }}>
          <Image src="/assets/LOGO-NEW-SPORTSCENTER.png" alt="Sports Center" width={130} height={30} priority />
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 13 }}>
          <a href="#home" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Home</a>
          <a href="#courts" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Courts</a>
          <Link
            href="/customer/status"
            style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}
          >
            Track booking
          </Link>
          <a
            href="#courts"
            style={{
              background: "#ffffff",
              color: "#0d6b4e",
              padding: "8px 16px",
              borderRadius: "var(--border-radius-md)",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 13,
              boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
            }}
          >
            Reserve a court
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        id="home"
        style={{
          background:
            "linear-gradient(150deg, rgba(29,158,117,0.10) 0%, rgba(29,158,117,0.04) 50%, transparent 100%)",
          borderBottom: "1px solid rgba(29,158,117,0.12)",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "64px 24px 52px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 16,
            padding: "4px 12px",
            borderRadius: 999,
            background: "rgba(29,158,117,0.12)",
            border: "1px solid rgba(29,158,117,0.25)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "#0F6E56",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1D9E75", display: "inline-block" }} />
          Badminton court booking
        </span>
        <h1
          style={{
            margin: "0 0 14px",
            fontSize: "clamp(2.2rem,5.5vw,3.4rem)",
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: "var(--color-text-primary)",
          }}
        >
          Book a court,<br />
          <span style={{ color: "#1D9E75" }}>play today.</span>
        </h1>
        <p
          style={{
            margin: "0 0 28px",
            fontSize: 16,
            lineHeight: 1.65,
            color: "var(--color-text-secondary)",
            maxWidth: "50ch",
          }}
        >
          Pick a date, choose a court, select a time slot, and submit in under
          a minute. We&apos;ll confirm your slot shortly.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href="#courts"
            style={{
              background: "#1D9E75",
              color: "#04342C",
              padding: "11px 22px",
              borderRadius: "var(--border-radius-md)",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Browse courts
          </a>
          <Link
            href="/customer/status"
            style={{
              padding: "11px 22px",
              borderRadius: "var(--border-radius-md)",
              border: "0.5px solid var(--color-border-secondary)",
              color: "var(--color-text-primary)",
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            Track my booking
          </Link>
        </div>

        {statusMessage && (
          <p
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: "var(--border-radius-md)",
              background: "#E1F5EE",
              color: "#085041",
              fontSize: 13,
            }}
          >
            {statusMessage}{" "}
            {trackingParams && (
              <Link
                href={`/customer/status?${trackingParams}`}
                style={{ color: "#0F6E56", fontWeight: 500 }}
              >
                View status →
              </Link>
            )}
          </p>
        )}
        {errorMessage && !isModalOpen && (
          <p
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: "var(--border-radius-md)",
              background: "var(--color-background-danger)",
              color: "var(--color-text-danger)",
              fontSize: 13,
            }}
          >
            {errorMessage}
          </p>
        )}
        </div>
      </section>

      {/* ── COURTS ── */}
      <section
        id="courts"
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "40px 24px 72px",
        }}
      >
        {/* Section header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--color-text-primary)" }}>Available courts</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>Select a court below to reserve a slot</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "var(--color-text-secondary)" }}>Date:</span>
            <input
              type="date"
              value={form.bookingDate}
              min={todayISODate()}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, bookingDate: e.target.value, startTime: "", endTime: "" }))
              }
              style={{
                ...inputStyle,
                height: 36,
                width: "auto",
                padding: "0 10px",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--color-border-secondary)",
                borderRadius: "var(--border-radius-md)",
                boxShadow: "0 1px 4px rgba(13,100,68,0.06)",
              }}
            />
            {isLoading && (
              <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
                Refreshing…
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 20,
            fontSize: 12,
            color: "var(--color-text-secondary)",
            padding: "8px 14px",
            background: "var(--color-background-primary)",
            border: "1px solid var(--color-border-tertiary)",
            borderRadius: "var(--border-radius-md)",
            width: "fit-content",
            boxShadow: "0 1px 4px rgba(13,100,68,0.05)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#1D9E75", boxShadow: "0 0 0 2px rgba(29,158,117,0.2)" }} />
            Available
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#E24B4A", boxShadow: "0 0 0 2px rgba(226,75,74,0.2)" }} />
            Booked
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#F2A23B", boxShadow: "0 0 0 2px rgba(242,162,59,0.2)" }} />
            Blocked
          </span>
        </div>

        {courts.length === 0 && !isLoading && (
          <p
            style={{
              padding: "20px 18px",
              borderRadius: "var(--border-radius-lg)",
              background: "var(--color-background-primary)",
              border: "1px solid var(--color-border-tertiary)",
              color: "var(--color-text-secondary)",
              fontSize: 14,
              boxShadow: "0 1px 4px rgba(13,100,68,0.05)",
            }}
          >
            No active courts found for this date.
          </p>
        )}

        {/* Court cards grid */}
        <ul
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {courts.map((court) => {
            const bookedStarts = bookings
              .filter(
                (b) =>
                  b.courtId === court.id &&
                  !["EXPIRED", "CANCELLED", "DENIED"].includes(b.status)
              )
              .map((b) => b.startTime);
            const courtBlocks = blockedSlots.filter((slot) => slot.courtId === court.id);
            const blockedStarts = ALL_SLOTS.filter((slotStart) => {
              const slotEnd = addHour(slotStart);
              return courtBlocks.some((blocked) =>
                rangesOverlap(slotStart, slotEnd, blocked.startTime, blocked.endTime)
              );
            });

            const bookedCount = new Set(bookedStarts).size;
            const blockedCount = new Set(blockedStarts).size;
            const takenCount = new Set([
              ...bookedStarts,
              ...blockedStarts,
            ]).size;
            const totalSlots = ALL_SLOTS.length;

            return (
              <li key={court.id}>
                <article
                  style={{
                    background: "var(--color-background-primary)",
                    border: "1px solid var(--color-border-tertiary)",
                    borderTop: `3px solid ${takenCount === totalSlots ? "#E24B4A" : "#1D9E75"}`,
                    borderRadius: "var(--border-radius-lg)",
                    padding: 20,
                    height: "100%",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 2px 16px rgba(13,100,68,0.08), 0 1px 4px rgba(13,100,68,0.04)",
                    transition: "box-shadow 0.18s, transform 0.18s",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "3px 8px",
                      borderRadius: "var(--border-radius-md)",
                      marginBottom: 8,
                      background: court.surfaceType === "wooden" ? "#FAEEDA" : "#E1F5EE",
                      color: court.surfaceType === "wooden" ? "#854F0B" : "#0F6E56",
                    }}
                  >
                    {court.surfaceType} surface
                  </span>

                  <h3
                    style={{
                      margin: "0 0 2px",
                      fontSize: 15,
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {court.name}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {bookedCount} booked, {blockedCount} blocked ({takenCount} unavailable of {totalSlots})
                  </p>

                  <SlotDots total={totalSlots} taken={takenCount} />

                  <button
                    type="button"
                    onClick={() => openModal(court.id)}
                    disabled={takenCount === totalSlots}
                    style={{
                      marginTop: "auto",
                      width: "100%",
                      padding: "9px",
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: "var(--border-radius-md)",
                      border: "none",
                      cursor: takenCount === totalSlots ? "not-allowed" : "pointer",
                      background: takenCount === totalSlots ? "var(--color-background-tertiary)" : "#1D9E75",
                      color: takenCount === totalSlots ? "var(--color-text-secondary)" : "#ffffff",
                      opacity: takenCount === totalSlots ? 0.6 : 1,
                      boxShadow: takenCount === totalSlots ? "none" : "0 2px 10px rgba(29,158,117,0.3)",
                    }}
                  >
                    {takenCount === totalSlots ? "Fully booked" : "Reserve this court"}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          borderTop: "1px solid #17876a",
          background: "#1D9E75",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "32px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 24,
          }}
        >
          <div>
            <Image src="/assets/LOGO-NEW-SPORTSCENTER.png" alt="Sports Center" width={150} height={36} />
          </div>
          <div>
            <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)" }}>
              Quick links
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6, fontSize: 13 }}>
              <li><a href="https://c-one.ph/#" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>C-One Official Website</a></li>
              <li><a href="https://c-one.ph/sports-center" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Sports Center</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)" }}>
              Contact
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
              <li>Sports Center Front Desk</li>
              <li>+63 917 123 4567</li>
              <li>booking@sportscenter.com</li>
            </ul>
          </div>
        </div>
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.2)",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <span>© {new Date().getFullYear()} C-One Sports Center. All rights reserved.</span>
          <Link href="/customer/status" style={{ color: "#ffffff", textDecoration: "none", fontWeight: 600 }}>
            Track my booking →
          </Link>
        </div>
      </footer>

      {/* ── RESERVATION MODAL ── */}
      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
          }}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "90dvh",
              overflowY: "auto",
              background: "var(--color-background-primary)",
              border: "1px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-lg)",
              padding: 28,
              boxSizing: "border-box",
              boxShadow: "0 24px 64px rgba(13,100,68,0.16), 0 4px 16px rgba(13,100,68,0.08)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0F6E56" }}>
                  Reservation
                </p>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>
                  {selectedCourt ? `Book ${selectedCourt.name}` : "Book a court"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: "var(--color-background-secondary)",
                  border: "none",
                  borderRadius: "var(--border-radius-md)",
                  padding: "5px 12px",
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            {/* Selected slot summary */}
            {form.startTime && (
              <div
                style={{
                  background: "#E1F5EE",
                  border: "0.5px solid #9FE1CB",
                  borderRadius: "var(--border-radius-md)",
                  padding: "10px 14px",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: "#04342C" }}>
                    {selectedCourt?.name} · {form.bookingDate}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#085041" }}>
                    {formatHour(form.startTime)} – {form.endTime ? formatHour(form.endTime) : "…"}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "3px 8px",
                    borderRadius: "var(--border-radius-md)",
                    background: "#1D9E75",
                    color: "#04342C",
                    whiteSpace: "nowrap",
                  }}
                >
                  Selected
                </span>
              </div>
            )}

            {/* Date picker */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                Select a date
              </p>
              <CalendarPicker
                selected={form.bookingDate}
                minDate={todayISODate()}
                onSelect={(date) =>
                  setForm((prev) => ({ ...prev, bookingDate: date, startTime: "", endTime: "" }))
                }
              />
            </div>

            {/* Timeline picker */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                Select time
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--color-text-secondary)" }}>
                  — 8 AM – 10 PM
                </span>
              </p>
              <TimelinePicker
                startTime={form.startTime}
                endTime={form.endTime}
                activeBookings={activeBookingsForCourt}
                blockedRanges={courtBlockedSlots}
                onChange={(start, end) => setForm((p) => ({ ...p, startTime: start, endTime: end }))}
              />
              {form.startTime && form.endTime && hasConflict(form.startTime, form.endTime) && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#dc2626" }}>
                  This time range conflicts with an existing booking or blocked slot.
                </p>
              )}
            </div>

            <hr style={{ border: "none", borderTop: "0.5px solid var(--color-border-tertiary)", margin: "0 0 20px" }} />

            {/* Booking form */}
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
              <label style={labelStyle}>
                Full name
                <input
                  style={inputStyle}
                  required
                  minLength={2}
                  placeholder="Alex Gonzalez"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={labelStyle}>
                  Contact number
                  <input
                    style={inputStyle}
                    required
                    minLength={7}
                    placeholder="0917 123 4567"
                    value={form.contactNumber}
                    onChange={(e) => setForm((p) => ({ ...p, contactNumber: e.target.value }))}
                  />
                </label>
                <label style={labelStyle}>
                  Gmail address
                  <input
                    style={inputStyle}
                    required
                    type="email"
                    placeholder="you@gmail.com"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </label>
              </div>

              {errorMessage && (
                <p
                  style={{
                    margin: 0,
                    padding: "8px 12px",
                    borderRadius: "var(--border-radius-md)",
                    background: "var(--color-background-danger)",
                    color: "var(--color-text-danger)",
                    fontSize: 13,
                  }}
                >
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !form.startTime || !form.endTime}
                style={{
                  width: "100%",
                  padding: "13px",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: "var(--border-radius-md)",
                  border: "none",
                  cursor: isSubmitting || !form.startTime || !form.endTime ? "not-allowed" : "pointer",
                  background: !form.startTime || !form.endTime ? "var(--color-background-tertiary)" : "#1D9E75",
                  color: !form.startTime || !form.endTime ? "var(--color-text-secondary)" : "#ffffff",
                  opacity: isSubmitting ? 0.6 : 1,
                  transition: "background 0.15s, box-shadow 0.15s",
                  boxShadow: !form.startTime || !form.endTime ? "none" : "0 3px 14px rgba(29,158,117,0.35)",
                }}
              >
                {isSubmitting ? "Submitting…" : !form.startTime || !form.endTime ? "Select a time range first" : "Submit reservation request"}
              </button>

              <p
                style={{
                  margin: 0,
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                }}
              >
                Pending admin approval · confirmation sent to your email
              </p>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
