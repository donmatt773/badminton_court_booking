"use client";

import { gql } from "@apollo/client";
import { useMutation, useQuery } from "@apollo/client/react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";
import { blockedSlotRangesOverlap } from "@/lib/shared/blocked-slot-time";

type Court = {
  id: string;
  name: string;
  surfaceType: "wooden" | "rubber";
  status: "active" | "inactive" | "maintenance";
  price: number;
  weekdayRate?: number | null;
  weekendRate?: number | null;
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
  paymentReference?: string;
};

type SuccessModalSummary = {
  courts: string[];
  bookingDate: string;
  startTime: string;
  endTime: string;
};

type PaymentSettings = {
  provider: string;
  accountName: string;
  accountNumber: string;
  instructions?: string | null;
  qrImage?: string | null;
};

// ---------------------------------------------------------------------------
// Time configuration
// ---------------------------------------------------------------------------
const WEEKDAY_SLOT_START_HOUR = 10; // 10:00 AM
const WEEKEND_SLOT_START_HOUR = 8;  // 8:00 AM
const SLOT_END_HOUR = 24;           // 12:00 AM (midnight)

function isWeekendDate(dateText: string): boolean {
  const day = new Date(`${dateText}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function slotStartHourForDate(dateText: string): number {
  return isWeekendDate(dateText) ? WEEKEND_SLOT_START_HOUR : WEEKDAY_SLOT_START_HOUR;
}

function courtHourlyRateForDate(court: Court, bookingDate: string): number {
  const fallbackRate = court.price ?? 0;
  const weekdayRate = court.weekdayRate ?? fallbackRate;
  const weekendRate = court.weekendRate ?? fallbackRate;
  return isWeekendDate(bookingDate) ? weekendRate : weekdayRate;
}

/** All selectable hours as "HH:00" strings */
function generateHours(startHour: number): string[] {
  const hours: string[] = [];
  for (let h = startHour; h <= SLOT_END_HOUR; h++) {
    hours.push(`${String(h).padStart(2, "0")}:00`);
  }
  return hours;
}

function formatHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  if (h === 24 || h === 0) return `12:${String(m).padStart(2, "0")} AM`;
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
  return blockedSlotRangesOverlap(startA, endA, startB, endB);
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
      weekdayRate
      weekendRate
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
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successSummary, setSuccessSummary] = useState<SuccessModalSummary | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [reservationStep, setReservationStep] = useState<1 | 2>(1);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [courtsPage, setCourtsPage] = useState(1);
  const [isMessageMenuOpen, setIsMessageMenuOpen] = useState(false);
  const COURTS_PER_PAGE = 6;

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

  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);

  function toggleCourt(id: string) {
    setSelectedCourtIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
    setForm((prev) => ({ ...prev, startTime: "", endTime: "" }));
  }

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
    fetchPolicy: "network-only",
  });

  const [createBooking, { loading: isSubmitting }] = useMutation<{
    createBooking: Booking;
  }>(CREATE_BOOKING_MUTATION);

  const courts = data?.courts ?? [];
  const bookings = data?.bookings ?? [];
  const blockedSlots = data?.blockedSlots ?? [];
  const isInitialLoading = isLoading && !data;
  const errorMessage = submissionErrorMessage || (queryError?.message ?? "");

  // Occupied bookings for the selected courts (PENDING is also treated as unavailable).
  const activeBookingsForCourt = useMemo(
    () =>
      bookings.filter(
        (b) =>
          selectedCourtIds.includes(b.courtId) &&
          ["PENDING", "CONFIRMED", "PAID", "APPROVED"].includes(b.status) &&
          !b.isArchived
      ),
    [bookings, selectedCourtIds]
  );

  // Blocked slots for the selected courts
  const courtBlockedSlots = useMemo(
    () => blockedSlots.filter((s) => selectedCourtIds.includes(s.courtId)),
    [blockedSlots, selectedCourtIds]
  );

  // Check if a proposed start/end overlaps any booking or blocked slot
  function hasConflict(start: string, end: string): boolean {
    if (!start || !end || start >= end) return false;
    return (
      activeBookingsForCourt.some((b) => rangesOverlap(start, end, b.startTime, b.endTime)) ||
      courtBlockedSlots.some((b) => rangesOverlap(start, end, b.startTime, b.endTime))
    );
  }

  const selectedCourts = useMemo(
    () => courts.filter((c) => selectedCourtIds.includes(c.id)),
    [courts, selectedCourtIds]
  );

  const slotStartHour = useMemo(() => slotStartHourForDate(form.bookingDate), [form.bookingDate]);
  const allHours = useMemo(() => generateHours(slotStartHour), [slotStartHour]);
  const allSlots = useMemo(() => allHours.slice(0, -1), [allHours]);
  const slotRows = useMemo(() => {
    const splitIndex = Math.ceil(allSlots.length / 2);
    return [allSlots.slice(0, splitIndex), allSlots.slice(splitIndex)].filter((row) => row.length > 0);
  }, [allSlots]);

  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefetchingFromRealtimeRef = useRef(false);
  const submitRequestLockRef = useRef(false);
  const messageMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const bookingChannel = pusher.subscribe(REALTIME_CHANNELS.bookings);
    const blockedSlotChannel = pusher.subscribe(REALTIME_CHANNELS.blockedSlots);
    const courtsChannel = pusher.subscribe(REALTIME_CHANNELS.courts);
    const handleUpdate = () => {
      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
      }

      // Collapse event bursts (bookings/blocked/courts) to one network request.
      refetchDebounceRef.current = setTimeout(() => {
        refetchDebounceRef.current = null;
        if (isRefetchingFromRealtimeRef.current) {
          return;
        }

        isRefetchingFromRealtimeRef.current = true;
        void refetch().finally(() => {
          isRefetchingFromRealtimeRef.current = false;
        });
      }, 120);
    };

    bookingChannel.bind(REALTIME_EVENTS.updated, handleUpdate);
    blockedSlotChannel.bind(REALTIME_EVENTS.updated, handleUpdate);
    courtsChannel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
        refetchDebounceRef.current = null;
      }
      bookingChannel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      blockedSlotChannel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      courtsChannel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
      pusher.unsubscribe(REALTIME_CHANNELS.blockedSlots);
      pusher.unsubscribe(REALTIME_CHANNELS.courts);
    };
  }, [refetch]);

  useEffect(() => {
    let isMounted = true;

    async function loadPaymentSettings(): Promise<void> {
      try {
        const response = await fetch("/api/payment-settings");
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as { data?: PaymentSettings };
        if (isMounted) {
          setPaymentSettings(body.data ?? null);
        }
      } catch {
        if (isMounted) {
          setPaymentSettings(null);
        }
      }
    }

    void loadPaymentSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isMessageMenuOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      if (!messageMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !messageMenuRef.current.contains(target)) {
        setIsMessageMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
    };
  }, [isMessageMenuOpen]);

  // Close modal on Escape
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setIsModalOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isModalOpen]);

  // Close success modal on Escape
  useEffect(() => {
    if (!isSuccessModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setIsSuccessModalOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isSuccessModalOpen]);

  // -------------------------------------------------------------------------
  function openModal(courtId: string) {
    setSelectedCourtIds([courtId]);
    setForm((prev) => ({ ...prev, startTime: "", endTime: "", paymentMethod: "cash", paymentProofImage: "" }));
    setStatusMessage("");
    setSubmissionErrorMessage("");
    setReservationStep(1);
    setIsModalOpen(true);
  }

  function validateStepOne(): string | null {
    if (selectedCourtIds.length === 0) {
      return "Please select at least one court.";
    }
    if (!form.startTime || !form.endTime) {
      return "Please select a time slot.";
    }
    if (form.startTime >= form.endTime) {
      return "Time out must be after time in.";
    }
    // DISABLED FOR TESTING: past-time validation
    // if (form.bookingDate === todayISODate() && form.startTime < currentTimeHHMM()) {
    //   return "You cannot select a past time.";
    // }
    if (form.startTime < `${String(slotStartHour).padStart(2, "0")}:00` || form.endTime > `${String(SLOT_END_HOUR).padStart(2, "0")}:00`) {
      return `Selected time must be within operating hours (${formatHour(`${String(slotStartHour).padStart(2, "0")}:00`)} - ${formatHour("24:00")}).`;
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
    if (submitRequestLockRef.current) {
      return;
    }

    if (reservationStep !== 2) {
      return;
    }

    const stepOneError = validateStepOne();
    if (stepOneError) {
      setSubmissionErrorMessage(stepOneError);
      return;
    }
    setSubmissionErrorMessage("");
    setStatusMessage("");
    submitRequestLockRef.current = true;
    setIsSubmittingRequest(true);
    try {
      await Promise.all(
        selectedCourtIds.map((cId) =>
          createBooking({
            variables: {
              input: {
                ...form,
                courtId: cId,
                paymentMethod: "cash",
                paymentProofImage: "",
              },
            },
          })
        )
      );
      setSuccessSummary({
        courts: selectedCourts.map((court) => court.name),
        bookingDate: form.bookingDate,
        startTime: form.startTime,
        endTime: form.endTime,
      });
      setStatusMessage("Reservation submitted successfully. Screenshot this confirmation for your payment reference, or ask the front desk if you need help paying.");
      setIsModalOpen(false);
      setIsSuccessModalOpen(true);
      await refetch();
    } catch (error) {
      setSubmissionErrorMessage(getErrorMessage(error, "Booking could not be submitted."));
    } finally {
      submitRequestLockRef.current = false;
      setIsSubmittingRequest(false);
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
        <div style={{ display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap", fontSize: 13 }}>
          <a href="#home" className="hidden sm:inline" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Home</a>
          <div ref={messageMenuRef} className="hidden sm:block" style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setIsMessageMenuOpen((prev) => !prev)}
              style={{
                color: "rgba(255,255,255,0.85)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                padding: 0,
              }}
            >
              Message
            </button>

            {isMessageMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 10px)",
                  right: 0,
                  minWidth: 190,
                  borderRadius: "var(--border-radius-md)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(17,24,39,0.98)",
                  boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
                  overflow: "hidden",
                }}
              >
                <a
                  href="viber://chat?number=%2B639171234567"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.9)",
                    textDecoration: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span aria-hidden="true" style={{ display: "inline-flex", width: 16, height: 16 }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 3C6.48 3 2 6.99 2 11.9c0 2.84 1.5 5.38 3.85 7.02V22l3.17-1.74c.94.26 1.94.4 2.98.4 5.52 0 10-3.99 10-8.9S17.52 3 12 3Z" fill="#8B5CF6" />
                      <path d="M9.12 8.89c.18-.18.43-.26.67-.19l1.16.33c.3.08.5.35.52.66l.04 1.06c.01.23-.07.45-.23.62l-.45.48c.44.82 1.1 1.53 1.93 2.02l.49-.45c.16-.15.38-.22.6-.2l1.1.09c.32.03.57.25.66.55l.29 1.03c.07.25 0 .52-.2.7l-.7.66c-.3.28-.72.4-1.12.31-3.06-.67-5.48-2.98-6.22-5.95-.1-.39.01-.8.3-1.09l.66-.64Z" fill="white" />
                    </svg>
                  </span>
                  Viber
                </a>
                <a
                  href="https://m.me/coneconesportscenter"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.9)",
                    textDecoration: "none",
                  }}
                >
                  <span aria-hidden="true" style={{ display: "inline-flex", width: 16, height: 16 }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C6.48 2 2 6.15 2 11.27c0 2.91 1.45 5.51 3.73 7.21V22l3.15-1.74c.98.27 2.03.41 3.12.41 5.52 0 10-4.15 10-9.27S17.52 2 12 2Z" fill="#0EA5E9" />
                      <path d="M8.13 13.73 11 10.63l2.03 1.69 2.83-3.01-3.07 1.67-1.98-1.69-2.68 4.44Z" fill="white" />
                    </svg>
                  </span>
                  Messenger
                </a>
              </div>
            )}
          </div>
          <a href="#courts" className="hidden sm:inline" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Courts</a>
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
              // min={todayISODate()} // DISABLED FOR TESTING: past-date restriction
              onChange={(e) => {
                setForm((prev) => ({ ...prev, bookingDate: e.target.value, startTime: "", endTime: "" }));
                setCourtsPage(1);
              }}
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
            {isInitialLoading && (
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

        {courts.length === 0 && !isInitialLoading && (
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
            gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
            gap: 12,
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {courts.slice((courtsPage - 1) * COURTS_PER_PAGE, courtsPage * COURTS_PER_PAGE).map((court) => {
            const activeCourtBookings = bookings.filter(
              (b) =>
                b.courtId === court.id &&
                ["PENDING", "CONFIRMED", "PAID", "APPROVED"].includes(b.status) &&
                !b.isArchived
            );
            const bookedStarts = allSlots.filter((slotStart) => {
              const slotEnd = addHour(slotStart);
              return activeCourtBookings.some((booking) =>
                rangesOverlap(slotStart, slotEnd, booking.startTime, booking.endTime)
              );
            });
            const courtBlocks = blockedSlots.filter((slot) => slot.courtId === court.id);
            const blockedStarts = allSlots.filter((slotStart) => {
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
            const totalSlots = allSlots.length;

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
                    {court.surfaceType.charAt(0).toUpperCase() + court.surfaceType.slice(1)} Surface
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
                    ₱{Number(courtHourlyRateForDate(court, form.bookingDate)).toFixed(2)} / hour
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

        {/* Pagination */}
        {courts.length > COURTS_PER_PAGE && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginTop: 24,
            }}
          >
            <button
              type="button"
              onClick={() => setCourtsPage((p) => Math.max(1, p - 1))}
              disabled={courtsPage === 1}
              style={{
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: "var(--border-radius-md)",
                border: "1px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                color: courtsPage === 1 ? "var(--color-text-secondary)" : "var(--color-text-primary)",
                cursor: courtsPage === 1 ? "not-allowed" : "pointer",
                opacity: courtsPage === 1 ? 0.5 : 1,
              }}
            >
              ‹ Prev
            </button>
            {Array.from({ length: Math.ceil(courts.length / COURTS_PER_PAGE) }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCourtsPage(page)}
                style={{
                  width: 34,
                  height: 34,
                  fontSize: 13,
                  fontWeight: page === courtsPage ? 700 : 400,
                  borderRadius: "var(--border-radius-md)",
                  border: page === courtsPage ? "1.5px solid #10B981" : "1px solid var(--color-border-secondary)",
                  background: page === courtsPage ? "rgba(16,185,129,0.12)" : "var(--color-background-primary)",
                  color: page === courtsPage ? "#10B981" : "var(--color-text-primary)",
                  cursor: "pointer",
                }}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCourtsPage((p) => Math.min(Math.ceil(courts.length / COURTS_PER_PAGE), p + 1))}
              disabled={courtsPage === Math.ceil(courts.length / COURTS_PER_PAGE)}
              style={{
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: "var(--border-radius-md)",
                border: "1px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                color: courtsPage === Math.ceil(courts.length / COURTS_PER_PAGE) ? "var(--color-text-secondary)" : "var(--color-text-primary)",
                cursor: courtsPage === Math.ceil(courts.length / COURTS_PER_PAGE) ? "not-allowed" : "pointer",
                opacity: courtsPage === Math.ceil(courts.length / COURTS_PER_PAGE) ? 0.5 : 1,
              }}
            >
              Next ›
            </button>
          </div>
        )}
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
              <li><a href="https://www.facebook.com/coneconesportscenter/" target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Facebook Page</a></li>
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
              maxWidth: reservationStep === 2 ? "min(980px, calc(100vw - 24px))" : "min(600px, calc(100vw - 24px))",
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
                  {selectedCourts.length === 1 ? `Book ${selectedCourts[0].name}` : selectedCourts.length > 1 ? `Book ${selectedCourts.length} courts` : "Book a court"}
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
                    {selectedCourts.length === 1 ? selectedCourts[0].name : `${selectedCourts.length} courts`} · {form.bookingDate}
                  </p>
                  {selectedCourts.length > 1 && (
                    <p style={{ margin: "0 0 2px", fontSize: 12, color: "#A7F3D0" }}>
                      {selectedCourts.map((court) => court.name).join(", ")}
                    </p>
                  )}
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
                        {step === 1 ? "Schedule" : "Details & approval"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                        {step === 1 ? "Pick date and time" : "Contact info and approval flow"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {reservationStep === 1 && (
              <div style={{ marginBottom: 10 }}>
                {/* Court selection */}
                <div style={{ marginBottom: 12 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                    Select court{selectedCourtIds.length !== 1 ? "s" : ""}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                    {courts.filter((c) => c.status === "active").map((court) => (
                      <label
                        key={court.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          borderRadius: "var(--border-radius-md)",
                          border: selectedCourtIds.includes(court.id) ? "1px solid rgba(16,185,129,0.55)" : "1px solid var(--color-border-tertiary)",
                          background: selectedCourtIds.includes(court.id) ? "rgba(16,185,129,0.08)" : "var(--color-background-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCourtIds.includes(court.id)}
                          onChange={() => toggleCourt(court.id)}
                          style={{ accentColor: "#10B981", width: 16, height: 16, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{court.name}</span>
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: "auto" }}>{court.surfaceType}</span>
                        <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>₱{courtHourlyRateForDate(court, form.bookingDate).toFixed(2)}/hr</span>
                      </label>
                    ))}
                  </div>
                </div>
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
                    Select a time slot
                  </p>
                  {/* Linear timeline – two rows, IN/OUT range selection */}
                  {slotRows.map((rowSlots, rowIdx) => {
                    const rowEndHour = rowSlots.length > 0
                      ? Number.parseInt(addHour(rowSlots[rowSlots.length - 1]).slice(0, 2), 10)
                      : SLOT_END_HOUR;
                    return (
                      <div key={rowIdx} style={{ display: "flex", marginBottom: rowIdx === 0 ? 14 : 0 }}>
                        {rowSlots.map((slotStart, idx) => {
                          const slotEnd = addHour(slotStart);
                          const isPast = form.bookingDate === todayISODate() && slotStart < currentTimeHHMM();
                          const isTaken = hasConflict(slotStart, slotEnd);
                          const isInRange = !!(form.startTime && form.endTime && slotStart >= form.startTime && slotEnd <= form.endTime);
                          const isStartSlot = form.startTime === slotStart;
                          const isEndSlot = form.endTime === slotEnd;
                          const isDisabled = isPast || isTaken;
                          const isFirst = idx === 0;
                          const isLast = idx === rowSlots.length - 1;
                          return (
                            <button
                              key={slotStart}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => {
                                if (!form.startTime || slotStart < form.startTime) {
                                  setForm((prev) => ({ ...prev, startTime: slotStart, endTime: slotEnd }));
                                } else if (slotStart === form.startTime) {
                                  setForm((prev) => ({ ...prev, startTime: "", endTime: "" }));
                                } else if (hasConflict(form.startTime, slotEnd)) {
                                  setForm((prev) => ({ ...prev, startTime: slotStart, endTime: slotEnd }));
                                } else {
                                  setForm((prev) => ({ ...prev, endTime: slotEnd }));
                                }
                              }}
                              style={{
                                position: "relative",
                                flex: 1,
                                padding: "6px 0 20px",
                                background: "none",
                                border: "none",
                                cursor: isDisabled ? "not-allowed" : "pointer",
                                opacity: isPast ? 0.4 : 1,
                              }}
                            >
                              <div style={{
                                fontSize: 10,
                                textAlign: "center",
                                marginBottom: 5,
                                color: isInRange ? "#6EE7B7" : isTaken ? "#F87171" : "var(--color-text-secondary)",
                                fontWeight: isStartSlot || isEndSlot ? 700 : 400,
                                whiteSpace: "nowrap",
                              }}>
                                {formatHour(slotStart)}
                              </div>
                              {/* track */}
                              <div style={{
                                height: 6,
                                background: isInRange ? "#10B981" : isTaken ? "rgba(239,68,68,0.45)" : "var(--color-border-secondary)",
                                borderRadius: isFirst ? "999px 0 0 999px" : isLast ? "0 999px 999px 0" : 0,
                                transition: "background 0.15s",
                              }} />
                              {/* left tick */}
                              <div style={{ position: "absolute", bottom: 10, left: 0, width: 1, height: 8, background: isInRange ? "#10B981" : "var(--color-border-secondary)" }} />
                              {/* status */}
                              {(isTaken || (isPast && !isTaken)) && (
                                <div style={{ position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", fontSize: 8, color: isTaken ? "#F87171" : "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                                  {isTaken ? "Taken" : "Past"}
                                </div>
                              )}
                              {/* IN indicator */}
                              {isStartSlot && (
                                <div style={{ position: "absolute", bottom: 0, left: 0, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, zIndex: 2 }}>
                                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 7px rgba(16,185,129,0.8)" }} />
                                  <span style={{ fontSize: 8, color: "#6EE7B7", fontWeight: 800, lineHeight: 1, letterSpacing: "0.04em" }}>IN</span>
                                </div>
                              )}
                              {/* OUT indicator */}
                              {isEndSlot && (
                                <div style={{ position: "absolute", bottom: 0, right: 0, transform: "translateX(50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, zIndex: 2 }}>
                                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#F59E0B", boxShadow: "0 0 7px rgba(245,158,11,0.8)" }} />
                                  <span style={{ fontSize: 8, color: "#FCD34D", fontWeight: 800, lineHeight: 1, letterSpacing: "0.04em" }}>OUT</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                        {/* row end label */}
                        <div style={{ flexShrink: 0 }}>
                          <div style={{ fontSize: 10, marginBottom: 5, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                            {formatHour(`${String(rowEndHour).padStart(2, "0")}:00`)}
                          </div>
                          <div style={{ width: 1, height: 6, background: "var(--color-border-secondary)" }} />
                        </div>
                      </div>
                    );
                  })}
                  {form.startTime && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
                      <span style={{ color: "#6EE7B7", fontWeight: 600 }}>IN</span> {formatHour(form.startTime)}
                      {" – "}
                      <span style={{ color: "#FCD34D", fontWeight: 600 }}>OUT</span> {formatHour(form.endTime)}
                      {" · "}
                      <span style={{ color: "#A7F3D0", fontWeight: 600 }}>
                        Duration {Math.max(0, (toMinutes(form.endTime) - toMinutes(form.startTime)) / 60)}h
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {reservationStep === 2 && (() => {
              const durationMinutes = form.startTime && form.endTime
                ? Math.max(0, toMinutes(form.endTime) - toMinutes(form.startTime))
                : 0;
              const hours = durationMinutes / 60;
              const totalPricePerHour = selectedCourts.reduce((sum, c) => sum + courtHourlyRateForDate(c, form.bookingDate), 0);
              const total = totalPricePerHour * hours;
              const hasSelection = durationMinutes > 0;
              const sectionCardStyle: React.CSSProperties = {
                borderRadius: "var(--border-radius-md)",
                border: "1px solid var(--color-border-tertiary)",
                background: "var(--color-background-secondary)",
                padding: "10px",
                display: "grid",
                gap: 10,
                alignContent: "start",
              };
              return (
                <div
                  style={{
                    marginBottom: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div style={sectionCardStyle}>
                    <div style={{ display: "grid", gap: 8 }}>
                      <label style={labelStyle}>
                        Name
                        <input
                          style={inputStyle}
                          required
                          minLength={2}
                          placeholder="Alex Gonzalez"
                          value={form.name}
                          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        />
                      </label>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
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

                    <div style={{ display: "grid", gap: 6 }}>
                      <p style={{ margin: "0", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                        Payment handling
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
                        Wait for receptionist approval first. After approval, send your payment screenshot via Messenger.
                      </p>
                    </div>

                  </div>

                  <div style={sectionCardStyle}>
                    <div
                      style={{
                        borderRadius: "var(--border-radius-md)",
                        border: hasSelection ? "1px solid rgba(16,185,129,0.35)" : "1px solid var(--color-border-tertiary)",
                        background: hasSelection ? "rgba(16,185,129,0.07)" : "var(--color-background-primary)",
                        padding: "8px 10px",
                        opacity: hasSelection ? 1 : 0.55,
                        transition: "all 0.2s",
                      }}
                    >
                      <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: hasSelection ? "#6EE7B7" : "var(--color-text-secondary)" }}>
                        Booking summary
                      </p>
                      {!hasSelection ? (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          Select a time range to see the total amount.
                        </p>
                      ) : (
                        <>
                          {selectedCourts.length > 1 && selectedCourts.map((c) => (
                            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>
                              <span>{c.name}</span>
                              <span>₱{courtHourlyRateForDate(c, form.bookingDate).toFixed(2)} / hr</span>
                            </div>
                          ))}
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                            <span>Selected courts</span>
                            <span style={{ color: "#E2E8F0", textAlign: "right" }}>{selectedCourts.map((court) => court.name).join(", ") || "—"}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                            <span>Schedule</span>
                            <span style={{ color: "#E2E8F0" }}>{form.bookingDate} · {formatHour(form.startTime)} - {formatHour(form.endTime)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                            <span>Hourly rate{selectedCourts.length > 1 ? " (combined)" : ""}</span>
                            <span>₱{totalPricePerHour.toFixed(2)} / hr</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                            <span>Booking duration</span>
                            <span>{Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m</span>
                          </div>
                          <div style={{ borderTop: "1px solid rgba(16,185,129,0.2)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>Estimated amount</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: "#10B981" }}>₱{total.toFixed(2)}</span>
                          </div>
                          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-text-secondary)" }}>
                            Wait for approval first. Payment screenshot is sent via Messenger and encoded by receptionist.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
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
                    disabled={isSubmittingRequest}
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
                      cursor: isSubmittingRequest ? "not-allowed" : "pointer",
                      background: "var(--color-background-secondary)",
                      color: "var(--color-text-primary)",
                      opacity: isSubmittingRequest ? 0.65 : 1,
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
                    Continue to details
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmittingRequest || isSubmitting || !form.startTime || !form.endTime}
                    style={{
                      flex: 1,
                      padding: "11px",
                      fontSize: 14,
                      fontWeight: 600,
                      borderRadius: "var(--border-radius-md)",
                      border: "none",
                      cursor: isSubmittingRequest || isSubmitting || !form.startTime || !form.endTime ? "not-allowed" : "pointer",
                      background: !form.startTime || !form.endTime ? "var(--color-background-tertiary)" : "linear-gradient(135deg, #10B981, #059669)",
                      color: !form.startTime || !form.endTime ? "var(--color-text-secondary)" : "#ffffff",
                      opacity: isSubmittingRequest || isSubmitting ? 0.6 : 1,
                      transition: "background 0.15s, box-shadow 0.15s",
                      boxShadow: !form.startTime || !form.endTime ? "none" : "0 3px 16px rgba(16,185,129,0.4)",
                    }}
                  >
                    {isSubmittingRequest || isSubmitting ? "Submitting request..." : "Submit reservation request"}
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

      {/* ── SUCCESS MODAL ── */}
      {isSuccessModalOpen && (
        <div
          onClick={() => setIsSuccessModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px",
          }}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "min(780px, calc(100vw - 24px))",
              background: "var(--color-background-primary)",
              border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: "var(--border-radius-lg)",
              padding: "18px 16px",
              boxSizing: "border-box",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(16,185,129,0.2)",
                  color: "#A7F3D0",
                  fontSize: 15,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6EE7B7" }}>
                  Booking request sent
                </p>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)" }}>
                  Reservation submitted successfully
                </h3>
              </div>
            </div>

            <p
              style={{
                margin: 0,
                padding: "10px 12px",
                borderRadius: "var(--border-radius-md)",
                background: "rgba(16,185,129,0.10)",
                border: "1px solid rgba(16,185,129,0.22)",
                fontSize: 13,
                color: "#A7F3D0",
                lineHeight: 1.6,
              }}
            >
              {statusMessage || "Your reservation request has been sent. Screenshot this confirmation for your payment reference, or ask the front desk if you need help paying."}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                alignItems: "start",
                gap: 12,
              }}
            >
              <div
                style={{
                  borderRadius: "var(--border-radius-md)",
                  border: "1px solid var(--color-border-tertiary)",
                  background: "var(--color-background-secondary)",
                  padding: "12px",
                  display: "grid",
                  gap: 10,
                }}
              >
                {successSummary && (
                  <div
                    style={{
                      borderRadius: "var(--border-radius-md)",
                      border: "1px solid var(--color-border-tertiary)",
                      background: "var(--color-background-primary)",
                      padding: "10px 12px",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-secondary)" }}>
                      Booking details
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-primary)" }}>
                      Court{successSummary.courts.length !== 1 ? "s" : ""}: {successSummary.courts.join(", ")}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-primary)" }}>
                      Date: {successSummary.bookingDate}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-primary)" }}>
                      Timeslot: {formatHour(successSummary.startTime)} - {formatHour(successSummary.endTime)}
                    </p>
                  </div>
                )}

                <div
                  style={{
                    borderRadius: "var(--border-radius-md)",
                    border: "1px solid rgba(251,191,36,0.25)",
                    background: "rgba(120,53,15,0.22)",
                    padding: "10px 12px",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#FCD34D" }}>
                    Payment reminder
                  </p>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#FEF3C7" }}>
                    Screenshot this confirmation before you leave this page. Use it when paying online, or show it to the front desk if you want staff assistance with payment.
                  </p>
                </div>
              </div>

              {(paymentSettings?.accountName || paymentSettings?.accountNumber || paymentSettings?.instructions || paymentSettings?.qrImage) ? (
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    borderRadius: "var(--border-radius-md)",
                    border: "1px solid var(--color-border-tertiary)",
                    background: "var(--color-background-secondary)",
                    padding: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-secondary)" }}>
                      Online payment destination
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-primary)" }}>
                      Send payment to the account below if you are paying online.
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 6,
                      borderRadius: "var(--border-radius-md)",
                      border: "1px solid var(--color-border-tertiary)",
                      background: "var(--color-background-primary)",
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Provider</span>
                      <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{paymentSettings?.provider || "GCash"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Account name</span>
                      <span style={{ color: "var(--color-text-primary)", fontWeight: 600, textAlign: "right" }}>{paymentSettings?.accountName || "-"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>Account number</span>
                      <span style={{ color: "var(--color-text-primary)", fontWeight: 600, textAlign: "right" }}>{paymentSettings?.accountNumber || "-"}</span>
                    </div>
                    {paymentSettings?.instructions ? (
                      <p style={{ margin: "4px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
                        {paymentSettings.instructions}
                      </p>
                    ) : null}
                  </div>

                  {paymentSettings?.qrImage ? (
                    <div
                      style={{
                        borderRadius: "var(--border-radius-md)",
                        border: "1px solid var(--color-border-tertiary)",
                        background: "var(--color-background-primary)",
                        padding: "12px",
                        display: "grid",
                        justifyItems: "center",
                        gap: 8,
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>Scan the QR code to pay online.</p>
                      <img
                        src={paymentSettings.qrImage}
                        alt={`${paymentSettings.provider || "Payment"} QR code`}
                        style={{
                          width: 160,
                          height: 160,
                          objectFit: "contain",
                          borderRadius: "var(--border-radius-md)",
                          border: "1px solid var(--color-border-tertiary)",
                          background: "#ffffff",
                          padding: 10,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setIsSuccessModalOpen(false)}
              style={{
                width: "100%",
                padding: "11px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: "var(--border-radius-md)",
                border: "none",
                cursor: "pointer",
                background: "linear-gradient(135deg, #10B981, #059669)",
                color: "#ffffff",
                boxShadow: "0 3px 16px rgba(16,185,129,0.35)",
              }}
            >
              Done
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
