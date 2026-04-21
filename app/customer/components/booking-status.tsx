"use client";

import { gql } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
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
    | "DENIED";
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
    return "bg-[rgba(102,255,168,0.2)] text-[#1d6a42]";
  }

  if (status === "DENIED" || status === "CANCELLED" || status === "EXPIRED") {
    return "bg-[rgba(255,113,113,0.18)] text-[#8f2d2d]";
  }

  return "bg-[rgba(248,212,120,0.2)] text-[#7d5b0b]";
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

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(REALTIME_CHANNELS.bookings);
    const handleUpdate = () => {
      void refetch();
    };

    channel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.bookings);
    };
  }, [refetch]);

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_10%_8%,rgba(88,241,148,0.24),transparent_35%),radial-gradient(circle_at_84%_16%,rgba(62,227,122,0.19),transparent_30%),linear-gradient(165deg,#f1fff6_0%,#ddfce9_58%,#d6f9e4_100%)] p-[clamp(1rem,3vw,2.5rem)] text-[#103120]">
      <section className="mx-auto max-w-5xl rounded-2xl border border-[rgba(21,111,56,0.2)] bg-[rgba(250,255,252,0.86)] p-4">
        <p className="m-0 text-[0.74rem] font-bold uppercase tracking-[0.11em] text-[#1b5c35]">Customer Tracking</p>
        <h1 className="mt-[0.55rem] mb-0 text-[clamp(1.5rem,3vw,2.2rem)] text-[#0f371f]">Booking Status</h1>
        <p className="mt-2 mb-0 text-[#1b5c35]">
          This page refreshes automatically every 15 seconds so you can follow updates in near real-time.
        </p>

        <div className="mt-[0.9rem] grid gap-[0.45rem] text-[0.9rem] text-[#1b5c35]">
          <span>Email: {email || "(not provided)"}</span>
          <span>Date: {bookingDate || "All dates"}</span>
        </div>

        <div className="mt-[0.8rem]">
          <Link href="/customer" className="font-bold text-[#0f371f]">
            Back to Booking Form
          </Link>
        </div>

        {loading ? <p className="mt-[0.9rem] mb-0 text-[#1b5c35]">Loading status...</p> : null}
        {error ? <p className="mt-[0.9rem] mb-0 text-[#ff9a9a]">{error.message || "Unable to load booking status right now."}</p> : null}

        {!loading && !error && filtered.length === 0 ? (
          <p className="mt-[0.9rem] mb-0 text-[#1b5c35]">No bookings found for the current filters yet.</p>
        ) : null}

        <ul className="mt-4 grid list-none gap-[0.65rem] p-0">
          {filtered.map((booking) => (
            <li
              key={booking.id}
              className="flex justify-between gap-[0.7rem] rounded-[0.8rem] border border-[rgba(21,106,55,0.17)] bg-[rgba(255,255,255,0.76)] p-[0.72rem]"
            >
              <div>
                <p className="m-0 font-bold text-[#0f371f]">{courtById.get(booking.courtId) ?? booking.courtId}</p>
                <p className="mt-[0.2rem] mb-0 text-[0.9rem] text-[#1b5c35]">
                  {booking.bookingDate} | {booking.startTime} - {booking.endTime}
                </p>
                <p className="mt-[0.2rem] mb-0 text-[0.9rem] text-[#1b5c35]">Booked by: {booking.customer.name}</p>
                {booking.denialReason ? (
                  <p className="mt-[0.35rem] mb-0 text-[0.88rem] text-[#ffb2b2]">Reason: {booking.denialReason}</p>
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
