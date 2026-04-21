"use client";

import { gql } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  }
`;

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
  }>(STATUS_QUERY, {
    variables: {
      bookingDate: bookingDate || undefined,
    },
  });

  const bookings = data?.bookings ?? [];
  const courts = data?.courts ?? [];

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
          {filtered.map((booking) => (
            <li
              key={booking.id}
              className="flex justify-between gap-[0.7rem] rounded-[0.8rem] border border-gray-700/60 bg-[#1F2937] p-[0.72rem]"
            >
              <div>
                <p className="m-0 font-bold text-white">{courtById.get(booking.courtId) ?? booking.courtId}</p>
                <p className="mt-[0.2rem] mb-0 text-[0.9rem] text-gray-400">
                  {booking.bookingDate} | {booking.startTime} - {booking.endTime}
                </p>
                <p className="mt-[0.2rem] mb-0 text-[0.9rem] text-gray-400">Booked by: {booking.customer.name}</p>
                {booking.denialReason ? (
                  <p className="mt-[0.35rem] mb-0 text-[0.88rem] text-red-400">Reason: {booking.denialReason}</p>
                ) : null}
              </div>
              <span className={`self-start rounded-full px-[0.62rem] py-[0.22rem] text-[0.8rem] font-bold ${statusToneClass(booking.status)}`}>
                {booking.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
