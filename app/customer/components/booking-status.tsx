"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type BookingStatusProps = {
  email?: string;
  bookingDate?: string;
  bookingId?: string;
};

const STATUS_QUERY = `
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
    return "bg-[rgba(102,255,168,0.2)] text-[#a6ffd1]";
  }

  if (status === "DENIED" || status === "CANCELLED" || status === "EXPIRED") {
    return "bg-[rgba(255,113,113,0.18)] text-[#ffc1c1]";
  }

  return "bg-[rgba(248,212,120,0.2)] text-[#ffe7ab]";
}

async function graphqlFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as GraphQLResponse<T>;

  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.[0]?.message ?? "Request failed. Please try again.";
    throw new Error(message);
  }

  if (!payload.data) {
    throw new Error("No data returned from server.");
  }

  return payload.data;
}

export default function BookingStatus({
  email = "",
  bookingDate = "",
  bookingId = "",
}: BookingStatusProps) {

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError("");

    try {
      const data = await graphqlFetch<{
        courts: Court[];
        bookings: Booking[];
      }>(STATUS_QUERY, {
        bookingDate: bookingDate || undefined,
      });

      setCourts(data.courts ?? []);
      setBookings(data.bookings ?? []);
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Unable to load booking status right now.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [bookingDate]);

  useEffect(() => {
    void loadData();

    const timer = window.setInterval(() => {
      void loadData();
    }, 15_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadData]);

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_10%_8%,rgba(88,241,148,0.24),transparent_35%),radial-gradient(circle_at_84%_16%,rgba(62,227,122,0.19),transparent_30%),linear-gradient(165deg,#f1fff6_0%,#ddfce9_58%,#d6f9e4_100%)] p-[clamp(1rem,3vw,2.5rem)] text-[#103120] dark:bg-[radial-gradient(circle_at_10%_8%,rgba(88,241,148,0.18),transparent_34%),radial-gradient(circle_at_84%_16%,rgba(62,227,122,0.16),transparent_30%),linear-gradient(165deg,#08140e_0%,#0d281b_58%,#060c09_100%)] dark:text-[#eafff3]">
      <section className="mx-auto max-w-5xl rounded-2xl border border-[rgba(21,111,56,0.2)] bg-[rgba(250,255,252,0.86)] p-4 dark:border-[rgba(130,255,193,0.24)] dark:bg-[rgba(7,21,14,0.82)]">
        <p className="m-0 text-[0.74rem] font-bold uppercase tracking-[0.11em] text-[#1b5c35] dark:text-[#8ff5bb]">Customer Tracking</p>
        <h1 className="mt-[0.55rem] mb-0 text-[clamp(1.5rem,3vw,2.2rem)] text-[#0f371f] dark:text-[#f1fff6]">Booking Status</h1>
        <p className="mt-2 mb-0 text-[#1b5c35] dark:text-[#bff3d4]">
          This page refreshes automatically every 15 seconds so you can follow updates in near real-time.
        </p>

        <div className="mt-[0.9rem] grid gap-[0.45rem] text-[0.9rem] text-[#1b5c35] dark:text-[#abebc5]">
          <span>Email: {email || "(not provided)"}</span>
          <span>Date: {bookingDate || "All dates"}</span>
        </div>

        <div className="mt-[0.8rem]">
          <Link href="/customer" className="font-bold text-[#0f371f] dark:text-[#ddffee]">
            Back to Booking Form
          </Link>
        </div>

        {isLoading ? <p className="mt-[0.9rem] mb-0 text-[#1b5c35] dark:text-[#9fe6be]">Loading status...</p> : null}
        {error ? <p className="mt-[0.9rem] mb-0 text-[#ff9a9a]">{error}</p> : null}

        {!isLoading && !error && filtered.length === 0 ? (
          <p className="mt-[0.9rem] mb-0 text-[#1b5c35] dark:text-[#9fe6be]">No bookings found for the current filters yet.</p>
        ) : null}

        <ul className="mt-4 grid list-none gap-[0.65rem] p-0">
          {filtered.map((booking) => (
            <li
              key={booking.id}
              className="flex justify-between gap-[0.7rem] rounded-[0.8rem] border border-[rgba(21,106,55,0.17)] bg-[rgba(255,255,255,0.76)] p-[0.72rem] dark:border-[rgba(126,255,189,0.18)] dark:bg-[rgba(16,40,27,0.62)]"
            >
              <div>
                <p className="m-0 font-bold text-[#0f371f] dark:text-[#f1fff6]">{courtById.get(booking.courtId) ?? booking.courtId}</p>
                <p className="mt-[0.2rem] mb-0 text-[0.9rem] text-[#1b5c35] dark:text-[#bcebd0]">
                  {booking.bookingDate} | {booking.startTime} - {booking.endTime}
                </p>
                <p className="mt-[0.2rem] mb-0 text-[0.9rem] text-[#1b5c35] dark:text-[#bcebd0]">Booked by: {booking.customer.name}</p>
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
