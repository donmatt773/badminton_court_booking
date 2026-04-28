"use client";

import { gql } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";

type Court = {
  id: string;
  name: string;
};

type Booking = {
  id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  expiresAt: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "PAID"
    | "APPROVED"
    | "EXPIRED"
    | "CANCELLED"
    | "DENIED"
    | "COMPLETE";
  customer: {
    email: string;
    name: string;
  };
  denialReason?: string | null;
};

type BlockedSlot = {
  id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
};

type BookingStatusProps = {
  email?: string;
  bookingDate?: string;
  bookingId?: string;
};

const STATUS_QUERY = gql`
  query BookingStatusPage($bookingDate: String) {
    courts {
      id
      name
    }
    bookings(bookingDate: $bookingDate) {
      id
      courtId
      bookingDate
      startTime
      endTime
      status
      denialReason
      customer {
        email
        name
      }
    }
    blockedSlots(bookingDate: $bookingDate) {
      id
      courtId
      bookingDate
      startTime
      endTime
    }
  }
`;

const EXTENDABLE_STATUSES: Booking["status"][] = ["APPROVED", "CONFIRMED", "PAID"];

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatHour(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return hhmm;
  }
  if (hours === 24 || hours === 0) {
    return `12:${String(minutes).padStart(2, "0")} AM`;
  }
  const normalizedHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${normalizedHour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);
}

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getExtensionAvailability(
  booking: Booking,
  bookings: Booking[],
  blockedSlots: BlockedSlot[]
): { canExtend: boolean; nextStartTime: string; nextEndTime: string; reason: string } {
  const nextStartTime = booking.endTime;
  const nextEndTime = minutesToTime(toMinutes(booking.endTime) + 60);

  if (toMinutes(nextEndTime) > toMinutes("24:00")) {
    return {
      canExtend: false,
      nextStartTime,
      nextEndTime,
      reason: "Court closes before the next extension slot ends.",
    };
  }

  const hasBookingConflict = bookings.some((candidate) => {
    if (candidate.id === booking.id) {
      return false;
    }
    if (candidate.courtId !== booking.courtId || candidate.bookingDate !== booking.bookingDate) {
      return false;
    }
    if (!["PENDING", "APPROVED", "CONFIRMED", "PAID"].includes(candidate.status)) {
      return false;
    }
    return rangesOverlap(nextStartTime, nextEndTime, candidate.startTime, candidate.endTime);
  });

  if (hasBookingConflict) {
    return {
      canExtend: false,
      expiresAt
      nextStartTime,
      nextEndTime,
      reason: "The next slot is already booked on this court.",
    };
  }

  const hasBlockedSlotConflict = blockedSlots.some((blockedSlot) => {
    if (blockedSlot.courtId !== booking.courtId || blockedSlot.bookingDate !== booking.bookingDate) {
      return false;
    }
    return rangesOverlap(nextStartTime, nextEndTime, blockedSlot.startTime, blockedSlot.endTime);
  });

  if (hasBlockedSlotConflict) {
    return {
      canExtend: false,
      nextStartTime,
      nextEndTime,
      reason: "The next slot is blocked for this court.",
    };
  }

  return {
    canExtend: true,
    nextStartTime,
    nextEndTime,
    reason: `Next slot available: ${formatHour(nextStartTime)} - ${formatHour(nextEndTime)}.`,
  };
}

function statusToneClass(status: Booking["status"]): string {
  if (status === "APPROVED" || status === "PAID" || status === "CONFIRMED") {
    return "bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-500/30";
  }

  if (status === "COMPLETE") {
    return "bg-indigo-900/30 text-indigo-400 ring-1 ring-indigo-500/30";
  }

  if (status === "DENIED" || status === "CANCELLED" || status === "EXPIRED") {
    return "bg-red-900/30 text-red-400 ring-1 ring-red-500/30";
  }

  return "bg-amber-900/30 text-amber-400 ring-1 ring-amber-500/30";
}

export default function BookingStatus({
  email = "",
  bookingDate = "",
  bookingId = "",
}: BookingStatusProps) {
  const { data, loading, error, refetch } = useQuery<{
    courts: Court[];
    bookings: Booking[];
    blockedSlots: BlockedSlot[];
  }>(STATUS_QUERY, {
    variables: {
      bookingDate: bookingDate || undefined,
    },
  });

  const bookings = data?.bookings ?? [];
  const courts = data?.courts ?? [];
  const blockedSlots = data?.blockedSlots ?? [];

  const filtered = useMemo(() => {
    return bookings
      .filter((booking) => {
        if (email && booking.customer.email.toLowerCase() !== email) {
          return false;
        }

        if (bookingId && booking.id !== bookingId) {
          return false;
        }

        return true;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [bookings, email, bookingId]);

  const courtById = useMemo(() => {
    return new Map(courts.map((court) => [court.id, court.name]));
  }, [courts]);

  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  const [openBookingActionId, setOpenBookingActionId] = useState<string | null>(null);
  const actionsPanelRef = useRef<HTMLDivElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!openBookingActionId) {
      return;
    }

    function handleOutsideClick(event: MouseEvent): void {
      if (!actionsPanelRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !actionsPanelRef.current.contains(target)) {
        setOpenBookingActionId(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [openBookingActionId]);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(REALTIME_CHANNELS.bookings);
    const handleUpdate = () => {
      void refetch();
      setUpdateNotice(`Your booking details were updated by the facility on ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Please review the latest information below.`);
    };

    channel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
    };
  }, [refetch]);

  return (
    <main className="min-h-dvh bg-[#0B0F1A] p-[clamp(1rem,3vw,2.5rem)] text-gray-100">
        <section className="mx-auto max-w-5xl rounded-2xl border border-gray-800 bg-[#111827] p-4">
        <p className="m-0 text-[0.74rem] font-bold uppercase tracking-[0.11em] text-emerald-400">Customer Tracking</p>
        <h1 className="mt-[0.55rem] mb-0 text-[clamp(1.5rem,3vw,2.2rem)] text-white">Booking Status</h1>
        <p className="mt-2 mb-0 text-gray-400">
          This page refreshes automatically every 15 seconds so you can follow updates in near real-time.
        </p>

        <div className="mt-[0.9rem] grid gap-[0.45rem] text-[0.9rem] text-gray-400">
          <span>Email: {email || "(not provided)"}</span>
          <span>Date: {bookingDate || "All dates"}</span>
        </div>

        <div className="mt-[0.8rem]">
          <Link href="/customer" className="font-bold text-emerald-400 hover:text-emerald-300">
            Back to Booking Form
          </Link>
        </div>

        {updateNotice && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-600/40 bg-amber-900/20 px-4 py-3 text-[0.88rem] text-amber-300">
            <span className="mt-0.5 text-amber-400">⚠</span>
            <span className="flex-1">{updateNotice}</span>
            <button
              type="button"
              className="ml-2 shrink-0 text-amber-500 hover:text-amber-300"
              onClick={() => setUpdateNotice(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {loading ? <p className="mt-[0.9rem] mb-0 text-gray-400">Loading status...</p> : null}
        {error ? <p className="mt-[0.9rem] mb-0 text-red-400">{error.message || "Unable to load booking status right now."}</p> : null}

        {!loading && !error && filtered.length === 0 ? (
          <p className="mt-[0.9rem] mb-0 text-gray-500">No bookings found for the current filters yet.</p>
        ) : null}

        <ul className="mt-4 grid list-none gap-[0.65rem] p-0">
          {filtered.map((booking) => {
            const expiresAtMs = new Date(booking.expiresAt).getTime();
            const hasValidExpiry = !Number.isNaN(expiresAtMs);
            const isPendingExpired =
              booking.status === "PENDING" && hasValidExpiry && expiresAtMs <= nowMs;
            const displayStatus = (isPendingExpired ? "EXPIRED" : booking.status) as Booking["status"];

            return (
              <li
                key={booking.id}
                className="relative flex justify-between gap-[0.7rem] rounded-[0.8rem] border border-gray-700/60 bg-[#1F2937] p-[0.72rem]"
              >
                <div>
                  <p className="m-0 font-bold text-white">{courtById.get(booking.courtId) ?? booking.courtId}</p>
                  <p className="mt-[0.2rem] mb-0 text-[0.9rem] text-gray-400">
                    {booking.bookingDate} | {booking.startTime} - {booking.endTime}
                  </p>
                  {booking.status === "PENDING" && hasValidExpiry ? (() => {
                    const diffMs = expiresAtMs - nowMs;
                    const isExpired = diffMs <= 0;
                    const countdown = formatCountdown(diffMs);

                    return (
                      <p className={`mt-[0.28rem] mb-0 text-[0.82rem] font-semibold ${isExpired ? "text-red-400" : diffMs < 10 * 60_000 ? "text-amber-300" : "text-emerald-300"}`}>
                        {isExpired ? "Pending request expired" : `Expires in ${countdown}`}
                      </p>
                    );
                  })() : null}
                  <p className="mt-[0.2rem] mb-0 text-[0.9rem] text-gray-400">Booked by: {booking.customer.name}</p>
                  {booking.denialReason ? (
                    <p className="mt-[0.35rem] mb-0 text-[0.88rem] text-red-400">Reason: {booking.denialReason}</p>
                  ) : null}
                </div>
                <div className="flex items-start gap-2">
                  <span className={`self-start rounded-full px-[0.62rem] py-[0.22rem] text-[0.8rem] font-bold ${statusToneClass(displayStatus)}`}>
                    {displayStatus}
                  </span>
                  {EXTENDABLE_STATUSES.includes(displayStatus) ? (
                  <div className="relative" ref={openBookingActionId === booking.id ? actionsPanelRef : null}>
                    <button
                      type="button"
                      onClick={() => setOpenBookingActionId((current) => (current === booking.id ? null : booking.id))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-600 bg-[#111827] text-gray-300 transition hover:border-emerald-500 hover:text-emerald-300"
                      aria-label="Open booking actions"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {openBookingActionId === booking.id ? (() => {
                      const availability = getExtensionAvailability(booking, bookings, blockedSlots);
                      return (
                        <div className="absolute right-0 top-10 z-10 w-72 rounded-xl border border-gray-700 bg-[#0B0F1A] p-3 shadow-2xl">
                          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">Actions</p>
                          <button
                            type="button"
                            disabled={!availability.canExtend}
                            className={`mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${availability.canExtend ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-gray-700 bg-[#111827] text-gray-500"}`}
                          >
                            <span>Extend</span>
                            <span>{availability.canExtend ? "Available" : "Unavailable"}</span>
                          </button>
                          <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${availability.canExtend ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>
                            <p className="m-0 font-semibold">
                              {availability.canExtend ? "Extension possible" : "Extension not possible"}
                            </p>
                            <p className="mt-1 mb-0">{availability.reason}</p>
                          </div>
                        </div>
                      );
                    })() : null}
                  </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
