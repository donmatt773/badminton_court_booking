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
  price: number;
};

type Booking = {
  id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  isArchived?: boolean;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "PAID"
    | "APPROVED"
    | "EXPIRED"
    | "CANCELLED"
    | "DENIED"
    | "COMPLETE"
    | "ARCHIVED";
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
  paymentMethod: "cash" | "online";
  paymentProofImage: string;
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
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function addHour(hhmm: string, delta = 1): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(h + delta).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutes(hhmm: string, delta = 1): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const total = h * 60 + m + delta;
  const nextHour = Math.floor(total / 60);
  const nextMinute = total % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

function currentTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
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
      price
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
      paymentMethod
    }
  }
`;

function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    const message = error.message.trim();

    if (message.startsWith("[") && message.endsWith("]")) {
      try {
        const issues = JSON.parse(message) as Array<{ message?: string; path?: string[] }>;
        const parsedMessage = issues
          .map((issue) => {
            const field = issue.path?.[0];
            return field && issue.message ? `${field}: ${issue.message}` : issue.message;
          })
          .filter((value): value is string => Boolean(value))
          .join(". ");

        if (parsedMessage) {
          return parsedMessage;
        }
      } catch {
        return message;
      }
    }

    return message;
  }
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
            background: i < taken ? "#EF4444" : "#10B981",
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          style={{
            background: "none", border: "1px solid var(--color-border-secondary)",
            borderRadius: 6, width: 24, height: 24,
            cursor: canGoPrev ? "pointer" : "not-allowed",
            fontSize: 14, color: canGoPrev ? "var(--color-text-primary)" : "#ccc",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >‹</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          style={{
            background: "none", border: "1px solid var(--color-border-secondary)",
            borderRadius: 6, width: 24, height: 24, cursor: "pointer",
            fontSize: 14, color: "var(--color-text-primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 2 }}>
        {DAY_LABELS.map((d) => (
          <span key={d} style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-secondary)", padding: "1px 0" }}>
            {d}
          </span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
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
                padding: "6px 2px",
                fontSize: 11,
                textAlign: "center",
                borderRadius: 6,
                border: isToday && !isSelected ? "1px solid #10B981" : "1px solid transparent",
                background: isSelected ? "#10B981" : "transparent",
                color: isSelected ? "#fff" : isPast ? "#4B5563" : "var(--color-text-primary)",
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
// Main component
// ---------------------------------------------------------------------------
export default function BookingExperience() {
  const [submissionErrorMessage, setSubmissionErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reservationStep, setReservationStep] = useState<1 | 2>(1);

  const [form, setForm] = useState<BookingInput>({
    name: "",
    contactNumber: "",
    email: "",
    courtId: "",
    bookingDate: todayISODate(),
    startTime: "",
    endTime: "",
    paymentMethod: "cash",
    paymentProofImage: "",
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
          !['EXPIRED', 'CANCELLED', 'DENIED', 'ARCHIVED'].includes(b.status) &&
          !b.isArchived
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
    setForm((prev) => ({ ...prev, courtId, startTime: "", endTime: "", paymentMethod: "cash", paymentProofImage: "" }));
    setStatusMessage("");
    setSubmissionErrorMessage("");
    setReservationStep(1);
    setIsModalOpen(true);
  }

  function validateStepOne(): string | null {
    if (!form.startTime || !form.endTime) {
      return "Please select both a time in and time out.";
    }
    if (form.startTime >= form.endTime) {
      return "Time out must be after time in.";
    }
    if (form.bookingDate === todayISODate() && form.startTime < currentTimeHHMM()) {
      return "You cannot select a past time.";
    }
    if (form.startTime < `${String(SLOT_START_HOUR).padStart(2, "0")}:00` || form.endTime > `${String(SLOT_END_HOUR).padStart(2, "0")}:00`) {
      return "Selected time must be within operating hours (8:00 AM - 10:00 PM).";
    }
    if (hasConflict(form.startTime, form.endTime)) {
      return "That time range overlaps an existing booking or blocked slot. Please choose a different time.";
    }

    return null;
  }

  function goToPaymentStep(): void {
    const error = validateStepOne();
    if (error) {
      setSubmissionErrorMessage(error);
      return;
    }

    setSubmissionErrorMessage("");
    setReservationStep(2);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (reservationStep !== 2) {
      return;
    }

    const stepOneError = validateStepOne();
    if (stepOneError) {
      setSubmissionErrorMessage(stepOneError);
      return;
    }
    if (form.paymentMethod === "online" && !form.paymentProofImage) {
      setSubmissionErrorMessage("Please upload a screenshot of your online payment.");
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
          "radial-gradient(ellipse 90% 55% at 70% -5%, rgba(16,185,129,0.12) 0%, transparent 55%)," +
          "radial-gradient(ellipse 60% 45% at -5% 55%, rgba(52,211,153,0.07) 0%, transparent 50%)," +
          "#0B0F1A",
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
          background: "rgba(11,15,26,0.92)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
        }}
      >
        <a href="#home" style={{ display: "inline-flex" }}>
          <Image src="/assets/LOGO-NEW-SPORTSCENTER.png" alt="Sports Center" width={130} height={30} priority />
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 13 }}>
          <a href="#home" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Home</a>
          <a href="#courts" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Courts</a>
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
          <Link
            href="/login"
            style={{
              padding: "8px 16px",
              borderRadius: "var(--border-radius-md)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "rgba(255,255,255,0.85)",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 13,
              transition: "background 0.15s",
            }}
          >
            Login
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        id="home"
        style={{
          background:
            "linear-gradient(150deg, rgba(16,185,129,0.08) 0%, rgba(52,211,153,0.04) 50%, transparent 100%)",
          borderBottom: "1px solid rgba(16,185,129,0.10)",
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
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.25)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "#A7F3D0",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
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
          <span style={{ background: "linear-gradient(90deg, #10B981, #34D399)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent", display: "inline" }}>play today.</span>
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
              background: "linear-gradient(135deg, #10B981, #059669)",
              color: "#ffffff",
              padding: "11px 22px",
              borderRadius: "var(--border-radius-md)",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
              boxShadow: "0 2px 12px rgba(16,185,129,0.4)",
            }}
          >
            Browse courts
          </a>
        </div>

        {statusMessage && (
          <p
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: "var(--border-radius-md)",
              background: "rgba(16,185,129,0.12)",
              color: "#A7F3D0",
              fontSize: 13,
            }}
          >
            {statusMessage}
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
            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 0 2px rgba(16,185,129,0.25)" }} />
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
                  !["EXPIRED", "CANCELLED", "DENIED", "ARCHIVED"].includes(b.status) &&
                  !b.isArchived
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
                    borderTop: `3px solid ${takenCount === totalSlots ? "#EF4444" : "#10B981"}`,
                    borderRadius: "var(--border-radius-lg)",
                    padding: 20,
                    height: "100%",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: takenCount === totalSlots ? "none" : "0 2px 20px rgba(16,185,129,0.08), 0 1px 4px rgba(0,0,0,0.2)",
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
                      background: court.surfaceType === "wooden" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.12)",
                      color: court.surfaceType === "wooden" ? "#FCD34D" : "#A7F3D0",
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
                      margin: "0 0 4px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#10B981",
                    }}
                  >
                    ₱{Number(court.price ?? 0).toFixed(2)} / hour
                  </p>
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
                      background: takenCount === totalSlots ? "var(--color-background-tertiary)" : "linear-gradient(135deg, #10B981, #059669)",
                      color: takenCount === totalSlots ? "var(--color-text-secondary)" : "#ffffff",
                      opacity: takenCount === totalSlots ? 0.6 : 1,
                      boxShadow: takenCount === totalSlots ? "none" : "0 2px 12px rgba(16,185,129,0.35)",
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
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "#060B14",
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
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "10px 12px",
            overflowY: "auto",
          }}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 600,
              maxHeight: "calc(100dvh - 20px)",
              overflowY: "auto",
              background: "var(--color-background-primary)",
              border: "1px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-lg)",
              padding: 16,
              boxSizing: "border-box",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6EE7B7" }}>
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
                  background: "rgba(16,185,129,0.10)",
                  border: "0.5px solid rgba(16,185,129,0.25)",
                  borderRadius: "var(--border-radius-md)",
                  padding: "8px 12px",
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: "#E2E8F0" }}>
                    {selectedCourt?.name} · {form.bookingDate}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#94A3B8" }}>
                    {formatHour(form.startTime)} – {form.endTime ? formatHour(form.endTime) : "…"}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "3px 8px",
                    borderRadius: "var(--border-radius-md)",
                    background: "rgba(16,185,129,0.20)",
                    color: "#A7F3D0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Selected
                </span>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 6,
                marginBottom: 10,
              }}
            >
              {[1, 2].map((step) => {
                const isActive = reservationStep === step;
                const isDone = reservationStep > step;

                return (
                  <div
                    key={step}
                    style={{
                      borderRadius: "var(--border-radius-md)",
                      border: isActive ? "1px solid rgba(16,185,129,0.45)" : "1px solid var(--color-border-tertiary)",
                      background: isActive ? "rgba(16,185,129,0.08)" : "var(--color-background-secondary)",
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        background: isActive || isDone ? "#10B981" : "rgba(255,255,255,0.08)",
                        color: isActive || isDone ? "#fff" : "var(--color-text-secondary)",
                        flexShrink: 0,
                      }}
                    >
                      {isDone ? "✓" : step}
                    </span>
                    <div style={{ display: "grid", gap: 1 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {step === 1 ? "Schedule" : "Details & payment"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                        {step === 1 ? "Pick date and time" : "Contact info and payment method"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {reservationStep === 1 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ marginBottom: 10 }}>
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

                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                    Select time
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "stretch", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 230px", display: "grid", gap: 6 }}>
                      <label style={labelStyle}>
                        Time in
                        <input
                          type="time"
                          step={60}
                          min={
                            form.bookingDate === todayISODate()
                              ? (currentTimeHHMM() < `${String(SLOT_START_HOUR).padStart(2, "0")}:00`
                                  ? `${String(SLOT_START_HOUR).padStart(2, "0")}:00`
                                  : currentTimeHHMM())
                              : `${String(SLOT_START_HOUR).padStart(2, "0")}:00`
                          }
                          max={`${String(SLOT_END_HOUR - 1).padStart(2, "0")}:59`}
                          value={form.startTime}
                          onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                          style={inputStyle}
                        />
                      </label>
                      <label style={labelStyle}>
                        Time out
                        <input
                          type="time"
                          step={60}
                          min={
                            form.startTime
                              ? addMinutes(form.startTime, 1)
                              : form.bookingDate === todayISODate()
                              ? (currentTimeHHMM() < `${String(SLOT_START_HOUR).padStart(2, "0")}:00`
                                  ? `${String(SLOT_START_HOUR).padStart(2, "0")}:00`
                                  : currentTimeHHMM())
                              : `${String(SLOT_START_HOUR).padStart(2, "0")}:00`
                          }
                          max={`${String(SLOT_END_HOUR).padStart(2, "0")}:00`}
                          value={form.endTime}
                          onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                          style={inputStyle}
                        />
                      </label>
                    </div>

                    {(() => {
                      const preview = form.startTime || currentTimeHHMM();
                      const [h, m] = preview.split(":").map(Number);
                      const hourDeg = (isNaN(h) ? 0 : ((h % 12) + (isNaN(m) ? 0 : m / 60)) * 30);
                      const minuteDeg = (isNaN(m) ? 0 : m * 6);
                      const durationMinutes = form.startTime && form.endTime ? Math.max(0, toMinutes(form.endTime) - toMinutes(form.startTime)) : 0;

                      return (
                        <div
                          style={{
                            flex: "0 0 138px",
                            border: "1px solid var(--color-border-secondary)",
                            borderRadius: "var(--border-radius-md)",
                            padding: 8,
                            background: "var(--color-background-secondary)",
                            display: "grid",
                            gap: 6,
                            alignContent: "start",
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
                            Clock preview
                          </p>
                          <div
                            style={{
                              width: 70,
                              height: 70,
                              margin: "0 auto",
                              borderRadius: "50%",
                              border: "2px solid rgba(16,185,129,0.45)",
                              background: "radial-gradient(circle at 30% 30%, rgba(16,185,129,0.22), rgba(11,15,26,0.9) 70%)",
                              position: "relative",
                            }}
                          >
                            <span style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "#6EE7B7" }}>12</span>
                            <span style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "#6EE7B7" }}>6</span>
                            <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#6EE7B7" }}>9</span>
                            <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#6EE7B7" }}>3</span>

                            <span
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                width: 2,
                                height: 18,
                                background: "#A7F3D0",
                                transformOrigin: "bottom center",
                                transform: `translate(-50%, -100%) rotate(${hourDeg}deg)`,
                                borderRadius: 999,
                              }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                width: 1.5,
                                height: 24,
                                background: "#10B981",
                                transformOrigin: "bottom center",
                                transform: `translate(-50%, -100%) rotate(${minuteDeg}deg)`,
                                borderRadius: 999,
                              }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: "#10B981",
                                transform: "translate(-50%, -50%)",
                              }}
                            />
                          </div>

                          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "grid", gap: 2 }}>
                            <span>In: {form.startTime ? formatHour(form.startTime) : "--:--"}</span>
                            <span>Out: {form.endTime ? formatHour(form.endTime) : "--:--"}</span>
                            <span>Duration: {durationMinutes > 0 ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m` : "--"}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {reservationStep === 2 && (() => {
              const pricePerHour = selectedCourt?.price ?? 0;
              const durationMinutes = form.startTime && form.endTime
                ? Math.max(0, toMinutes(form.endTime) - toMinutes(form.startTime))
                : 0;
              const hours = durationMinutes / 60;
              const total = pricePerHour * hours;
              const hasSelection = durationMinutes > 0;
              return (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ marginBottom: 10, display: "grid", gap: 8 }}>
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

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                  </div>

                  {/* Method toggle */}
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                    Payment method
                  </p>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    {(["cash", "online"] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, paymentMethod: method, paymentProofImage: "" }))}
                        style={{
                          flex: 1,
                          padding: "7px",
                          fontSize: 13,
                          fontWeight: 600,
                          borderRadius: "var(--border-radius-md)",
                          border: form.paymentMethod === method ? "1.5px solid #10B981" : "1px solid var(--color-border-secondary)",
                          background: form.paymentMethod === method ? "rgba(16,185,129,0.12)" : "var(--color-background-secondary)",
                          color: form.paymentMethod === method ? "#10B981" : "var(--color-text-secondary)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          textTransform: "capitalize",
                        }}
                      >
                        {method === "cash" ? "💵 Cash" : "📱 Online"}
                      </button>
                    ))}
                  </div>

                  {/* Cash: price breakdown */}
                  {form.paymentMethod === "cash" && (
                    <div
                      style={{
                        borderRadius: "var(--border-radius-md)",
                        border: hasSelection ? "1px solid rgba(16,185,129,0.35)" : "1px solid var(--color-border-tertiary)",
                        background: hasSelection ? "rgba(16,185,129,0.07)" : "var(--color-background-secondary)",
                        padding: "8px 10px",
                        opacity: hasSelection ? 1 : 0.55,
                        transition: "all 0.2s",
                      }}
                    >
                      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: hasSelection ? "#6EE7B7" : "var(--color-text-secondary)" }}>
                        Payment summary
                      </p>
                      {!hasSelection ? (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          Select a time range to see the total amount.
                        </p>
                      ) : (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                            <span>Rate</span>
                            <span>₱{pricePerHour.toFixed(2)} / hr</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                            <span>Duration</span>
                            <span>{Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m</span>
                          </div>
                          <div style={{ borderTop: "1px solid rgba(16,185,129,0.2)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>Total</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: "#10B981" }}>₱{total.toFixed(2)}</span>
                          </div>
                          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-text-secondary)" }}>
                            Payment is collected at the venue upon arrival.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Online: proof upload */}
                  {form.paymentMethod === "online" && (
                    <div
                      style={{
                        borderRadius: "var(--border-radius-md)",
                        border: form.paymentProofImage ? "1px solid rgba(16,185,129,0.35)" : "1px solid var(--color-border-tertiary)",
                        background: "var(--color-background-secondary)",
                        padding: "8px 10px",
                      }}
                    >
                      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6EE7B7" }}>
                        Payment proof
                      </p>
                      <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--color-text-secondary)" }}>
                        Transfer payment to our GCash/online account, then upload a screenshot below. Staff will verify and record the amount.
                      </p>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          padding: "7px",
                          borderRadius: "var(--border-radius-md)",
                          border: "1.5px dashed rgba(16,185,129,0.4)",
                          cursor: "pointer",
                          fontSize: 13,
                          color: "#6EE7B7",
                          background: "rgba(16,185,129,0.05)",
                        }}
                      >
                        📎 {form.paymentProofImage ? "Change screenshot" : "Upload payment screenshot"}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 3 * 1024 * 1024) {
                              setSubmissionErrorMessage("Image must be under 3 MB.");
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              setForm((p) => ({ ...p, paymentProofImage: reader.result as string }));
                              setSubmissionErrorMessage("");
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      {form.paymentProofImage && (
                        <div style={{ marginTop: 8, position: "relative" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={form.paymentProofImage}
                            alt="Payment proof"
                            style={{ width: "100%", maxHeight: 112, objectFit: "contain", borderRadius: "var(--border-radius-md)", border: "1px solid rgba(16,185,129,0.25)" }}
                          />
                          <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, paymentProofImage: "" }))}
                            style={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              background: "rgba(0,0,0,0.6)",
                              border: "none",
                              borderRadius: "50%",
                              width: 24,
                              height: 24,
                              fontSize: 12,
                              color: "#fff",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >✕</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <hr style={{ border: "none", borderTop: "0.5px solid var(--color-border-tertiary)", margin: "0 0 10px" }} />

            <form onSubmit={onSubmit} style={{ display: "grid", gap: 8 }}>
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

              <div style={{ display: "flex", gap: 8 }}>
                {reservationStep === 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionErrorMessage("");
                      setReservationStep(1);
                    }}
                    style={{
                      flex: 1,
                      padding: "11px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: "var(--border-radius-md)",
                      border: "1px solid var(--color-border-secondary)",
                      cursor: "pointer",
                      background: "var(--color-background-secondary)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    Back
                  </button>
                )}

                {reservationStep === 1 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      goToPaymentStep();
                    }}
                    style={{
                      flex: 1,
                      padding: "11px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: "var(--border-radius-md)",
                      border: "none",
                      cursor: "pointer",
                      background: "linear-gradient(135deg, #10B981, #059669)",
                      color: "#ffffff",
                      boxShadow: "0 3px 16px rgba(16,185,129,0.4)",
                    }}
                  >
                    Continue to payment
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting || !form.startTime || !form.endTime}
                    style={{
                      flex: 1,
                      padding: "11px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: "var(--border-radius-md)",
                      border: "none",
                      cursor: isSubmitting || !form.startTime || !form.endTime ? "not-allowed" : "pointer",
                      background: !form.startTime || !form.endTime ? "var(--color-background-tertiary)" : "linear-gradient(135deg, #10B981, #059669)",
                      color: !form.startTime || !form.endTime ? "var(--color-text-secondary)" : "#ffffff",
                      opacity: isSubmitting ? 0.6 : 1,
                      transition: "background 0.15s, box-shadow 0.15s",
                      boxShadow: !form.startTime || !form.endTime ? "none" : "0 3px 16px rgba(16,185,129,0.4)",
                    }}
                  >
                    {isSubmitting ? "Submitting…" : "Submit reservation request"}
                  </button>
                )}
              </div>

              <p
                style={{
                  margin: 0,
                  textAlign: "center",
                  fontSize: 11,
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
