"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

const COURTS_AND_BOOKINGS_QUERY = `
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
  }
`;

const CREATE_BOOKING_MUTATION = `
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
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
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

export default function BookingExperience() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [lastSubmitted, setLastSubmitted] = useState<LastSubmitted | null>(null);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState<boolean>(false);

  const [form, setForm] = useState<BookingInput>({
    name: "",
    contactNumber: "",
    email: "",
    courtId: "",
    bookingDate: todayISODate(),
    startTime: "18:00",
    endTime: "19:00",
  });

  const courtBookings = useMemo(() => {
    return bookings.filter((booking) => booking.courtId === form.courtId);
  }, [bookings, form.courtId]);

  const selectedCourt = useMemo(() => {
    return courts.find((court) => court.id === form.courtId) ?? null;
  }, [courts, form.courtId]);

  const inputClassName =
    "h-11 w-full appearance-none rounded-[0.74rem] border border-[rgba(27,123,62,0.24)] bg-[rgba(255,255,255,0.94)] px-[0.74rem] py-[0.68rem] text-[0.96rem] text-[#143d25] outline-none transition-[border-color,box-shadow] duration-200 ease-in focus:border-[rgba(129,255,185,0.8)] focus:shadow-[0_0_0_3px_rgba(92,247,161,0.2)] dark:border-[rgba(118,255,177,0.25)] dark:bg-[rgba(8,25,17,0.88)] dark:text-[#ecfff3]";

  const fieldLabelClassName = "grid gap-[0.34rem] text-[0.87rem] text-[#1d5a34] dark:text-[#9ce8be]";

  const trackingParams = useMemo(() => {
    if (!lastSubmitted) {
      return "";
    }

    return new URLSearchParams({
      email: lastSubmitted.email,
      date: lastSubmitted.bookingDate,
      bookingId: lastSubmitted.bookingId,
    }).toString();
  }, [lastSubmitted]);

  const loadData = useCallback(async (date: string): Promise<void> => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const data = await graphqlFetch<{
        courts: Court[];
        bookings: Booking[];
      }>(COURTS_AND_BOOKINGS_QUERY, { bookingDate: date });

      setCourts(data.courts ?? []);
      setBookings(data.bookings ?? []);

      setForm((previous) => {
        const hasCurrentCourt = data.courts.some((court) => court.id === previous.courtId);

        if (hasCurrentCourt || data.courts.length === 0) {
          return previous;
        }

        return {
          ...previous,
          courtId: data.courts[0].id,
        };
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to load courts right now."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(form.bookingDate);

    const timer = window.setInterval(() => {
      void loadData(form.bookingDate);
    }, 20_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [form.bookingDate, loadData]);

  function onDateChange(nextDate: string): void {
    setForm((previous) => ({ ...previous, bookingDate: nextDate }));
  }

  function openReservationModal(courtId: string): void {
    setForm((previous) => ({
      ...previous,
      courtId,
    }));
    setStatusMessage("");
    setErrorMessage("");
    setIsReservationModalOpen(true);
  }

  function closeReservationModal(): void {
    setIsReservationModalOpen(false);
  }

  useEffect(() => {
    if (!isReservationModalOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeReservationModal();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isReservationModalOpen]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const result = await graphqlFetch<{ createBooking: Booking }>(CREATE_BOOKING_MUTATION, {
        input: form,
      });

      setStatusMessage("Booking request submitted. Status is now pending approval.");
      setLastSubmitted({
        email: form.email,
        bookingDate: form.bookingDate,
        bookingId: result.createBooking.id,
      });
      setIsReservationModalOpen(false);
      await loadData(form.bookingDate);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Booking could not be submitted."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_14%_9%,rgba(74,213,120,0.24),transparent_33%),radial-gradient(circle_at_85%_15%,rgba(128,245,158,0.2),transparent_31%),linear-gradient(165deg,#f0fff5_0%,#daffec_52%,#d2ffe4_100%)] text-[#113120] dark:bg-[radial-gradient(circle_at_8%_8%,rgba(83,255,158,0.2),transparent_34%),radial-gradient(circle_at_88%_14%,rgba(62,227,122,0.16),transparent_28%),linear-gradient(165deg,#07170f_0%,#0b2418_52%,#040a08_100%)] dark:text-[#e8ffee]">
      <nav className="sticky top-0 z-30 border-b border-[rgba(31,120,63,0.25)] bg-[rgba(245,255,250,0.88)] backdrop-blur-lg dark:border-[rgba(98,255,174,0.2)] dark:bg-[rgba(5,19,13,0.82)]">
        <div className="mx-auto flex max-w-280 items-center justify-between px-4 py-1.5">
          <a href="#home" className="inline-flex">
            <Image src="/assets/LOGO-NEW-SPORTSCENTER.png" alt="Sports Center logo" width={140} height={32} priority />
          </a>
          <div className="flex items-center gap-6 text-sm font-semibold">
            <a href="#home" className="text-[#1b5c35] hover:text-[#0f341f] dark:text-[#a8f4c8] dark:hover:text-[#dffff0]">Home</a>
            <a href="#courts" className="text-[#1b5c35] hover:text-[#0f341f] dark:text-[#a8f4c8] dark:hover:text-[#dffff0]">Courts</a>
          </div>
        </div>
      </nav>

      <section id="home" className="mx-auto max-w-280 px-4 pt-10 pb-6 md:pt-16">
        <div className="rounded-[1.25rem] border border-[rgba(20,113,56,0.2)] bg-[rgba(245,255,250,0.84)] p-[clamp(1.2rem,3vw,2rem)] shadow-[0_14px_40px_rgba(10,74,40,0.1)] backdrop-blur-sm dark:border-[rgba(100,255,176,0.25)] dark:bg-[linear-gradient(145deg,rgba(22,64,44,0.86),rgba(8,24,16,0.88))] dark:shadow-[0_18px_60px_rgba(4,14,10,0.5)]">
          <div className="grid items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="m-0 text-[0.78rem] font-bold uppercase tracking-[0.11em] text-[#1d5a34] dark:text-[#8dffc0]">Showcase Landing</p>
              <h1 className="mt-[0.65rem] mb-0 text-[clamp(2rem,5vw,3.2rem)] leading-[1.08] text-[#0f341f] dark:text-[#f4fff7]">Reserve your badminton court with a premium booking flow.</h1>
              <p className="mt-[0.7rem] mb-0 max-w-[60ch] text-[#1d5a34] dark:text-[#baf9d4]">
                Browse our courts, pick one you like, and open a quick reservation modal to submit your slot request.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a href="#courts" className="inline-flex rounded-full bg-[linear-gradient(90deg,#32cc70_0%,#5df28d_100%)] px-5 py-3 text-sm font-extrabold text-[#03230f] transition-transform duration-200 hover:-translate-y-px">Explore Courts</a>
                <Link href="/customer/status" className="inline-flex rounded-full border border-[rgba(27,123,62,0.35)] px-5 py-3 text-sm font-bold text-[#0f341f] dark:border-[rgba(112,255,179,0.35)] dark:text-[#cbffe1]">
                  Track Booking
                </Link>
              </div>
            </div>

            <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-[rgba(19,102,54,0.17)] bg-[linear-gradient(160deg,rgba(222,255,236,0.9),rgba(190,245,212,0.9))] shadow-[0_10px_30px_rgba(10,74,40,0.1)] dark:border-[rgba(119,255,187,0.2)] dark:bg-[linear-gradient(160deg,rgba(16,52,35,0.95),rgba(8,27,18,0.95))]">
              <div className="absolute inset-3 rounded-xl border-2 border-[rgba(18,99,55,0.85)] dark:border-[rgba(132,255,191,0.8)]" />
              <div className="absolute inset-x-3 top-1/2 h-[2px] -translate-y-1/2 bg-[rgba(18,99,55,0.75)] dark:bg-[rgba(132,255,191,0.7)]" />
              <div className="absolute inset-y-3 left-1/2 w-[2px] -translate-x-1/2 bg-[rgba(18,99,55,0.75)] dark:bg-[rgba(132,255,191,0.7)]" />

              <div className="absolute left-[13%] top-[17%] rotate-[-20deg]">
                <div className="h-12 w-8 rounded-full border-2 border-[#0f341f] bg-white/60 dark:border-[#d9ffeb] dark:bg-[#7cffb640]" />
                <div className="mx-auto -mt-0.5 h-8 w-1.5 rounded-b-full bg-[#0f341f] dark:bg-[#d9ffeb]" />
              </div>

              <div className="absolute right-[14%] top-[56%] rotate-[18deg]">
                <div className="h-11 w-7 rounded-full border-2 border-[#0f341f] bg-white/60 dark:border-[#d9ffeb] dark:bg-[#7cffb640]" />
                <div className="mx-auto -mt-0.5 h-7 w-1.5 rounded-b-full bg-[#0f341f] dark:bg-[#d9ffeb]" />
              </div>

            </div>
          </div>
        </div>

        {statusMessage ? <p className="mt-4 mb-0 text-[0.95rem] text-[#1d5a34] dark:text-[#8affb8]">{statusMessage}</p> : null}
        {trackingParams ? (
          <p className="mt-2 mb-0 text-[0.9rem] text-[#1d5a34] dark:text-[#a8f4c8]">
            Track latest booking updates:{" "}
            <Link
              href={`/customer/status?${trackingParams}`}
              className="font-bold text-[#0f341f] underline underline-offset-2 hover:text-[#1b5c35] dark:text-[#dffff0] dark:hover:text-[#86ffbc]"
            >
              View Booking Status
            </Link>
          </p>
        ) : null}
        {errorMessage ? <p className="mt-2 mb-0 text-[0.92rem] text-[#ff9797]">{errorMessage}</p> : null}
      </section>

      <section id="courts" className="mx-auto max-w-280 px-4 pb-12 md:pb-16">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="m-0 text-[0.78rem] font-bold uppercase tracking-[0.11em] text-[#1d5a34] dark:text-[#8dffc0]">Courts</p>
            <h2 className="m-0 mt-1 text-[clamp(1.4rem,3vw,2rem)] text-[#0f341f] dark:text-[#e8ffee]">Choose your court</h2>
          </div>
          {isLoading ? <p className="m-0 text-sm text-[#1d5a34] dark:text-[#9fe7bf]">Refreshing...</p> : null}
        </div>

        {courts.length === 0 && !isLoading ? (
          <p className="rounded-xl border border-[rgba(19,102,54,0.15)] bg-[rgba(255,255,255,0.75)] p-4 text-[#1d5a34] dark:border-[rgba(119,255,187,0.16)] dark:bg-[rgba(14,38,26,0.62)] dark:text-[#9fe7bf]">
            No active courts found right now.
          </p>
        ) : null}

        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {courts.map((court) => {
            const courtSlotCount = bookings.filter((item) => item.courtId === court.id).length;

            return (
              <li key={court.id}>
                <article className="h-full rounded-2xl border border-[rgba(19,102,54,0.15)] bg-[rgba(255,255,255,0.78)] p-4 shadow-[0_10px_30px_rgba(10,74,40,0.1)] dark:border-[rgba(119,255,187,0.16)] dark:bg-[rgba(14,38,26,0.68)] dark:shadow-none">
                  <p className="m-0 text-xs font-bold uppercase tracking-[0.09em] text-[#1d5a34] dark:text-[#9be8be]">{court.surfaceType} surface</p>
                  <h3 className="m-0 mt-1 text-lg font-bold text-[#0f341f] dark:text-[#effff5]">{court.name}</h3>
                  <p className="m-0 mt-2 text-sm text-[#1d5a34] dark:text-[#b2ffd0]">{courtSlotCount} booked slot(s) on {form.bookingDate}</p>
                  <button
                    type="button"
                    onClick={() => openReservationModal(court.id)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,#32cc70_0%,#5df28d_100%)] px-4 py-2.5 text-sm font-extrabold text-[#03230f] transition-transform duration-200 hover:-translate-y-px"
                  >
                    <Image src="/assets/tab-icon.png" alt="Reserve" width={16} height={16} />
                    Reserve This Court
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="border-t border-[rgba(31,120,63,0.22)] bg-[rgba(245,255,250,0.75)] dark:border-[rgba(98,255,174,0.18)] dark:bg-[rgba(5,19,13,0.72)]">
        <div className="mx-auto grid max-w-280 gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Image src="/assets/LOGO-NEW-SPORTSCENTER.png" alt="Sports Center logo" width={170} height={40} />
            
          </div>

          <div>
            <h4 className="m-0 text-sm font-extrabold uppercase tracking-[0.09em] text-[#0f341f] dark:text-[#dffff0]">Quick Links</h4>
            <ul className="mt-3 grid list-none gap-2 p-0 text-sm">
              <li>
                <a href="https://c-one.ph/#" className="text-[#1b5c35] hover:text-[#0f341f] dark:text-[#a8f4c8] dark:hover:text-[#e7fff2]">C-One Official Website</a>
              </li>
              <li>
                <a href="https://c-one.ph/sports-center" className="text-[#1b5c35] hover:text-[#0f341f] dark:text-[#a8f4c8] dark:hover:text-[#e7fff2]">C-One Sport Center Website</a>
              </li>
              <li>
                <Link href="https://c-one.ph/sports-center" className="text-[#1b5c35] hover:text-[#0f341f] dark:text-[#a8f4c8] dark:hover:text-[#e7fff2]">C-One Official Facebook</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="m-0 text-sm font-extrabold uppercase tracking-[0.09em] text-[#0f341f] dark:text-[#dffff0]">Contact</h4>
            <ul className="mt-3 grid list-none gap-2 p-0 text-sm text-[#1d5a34] dark:text-[#a8f4c8]">
              <li>Sports Center Front Desk</li>
              <li>+63 917 123 4567</li>
              <li>booking@sportscenter.com</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[rgba(31,120,63,0.16)] px-4 py-3 text-center text-xs text-[#1d5a34] dark:border-[rgba(98,255,174,0.14)] dark:text-[#9fe7bf]">
          © {new Date().getFullYear()} C-One Sports Center. All rights reserved.
        </div>
      </footer>

      {isReservationModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgba(3,12,8,0.58)] p-3 sm:p-4" onClick={closeReservationModal}>
          <section
            className="my-4 w-full max-w-xl overflow-y-auto rounded-2xl border border-[rgba(100,255,176,0.25)] bg-[rgba(5,16,11,0.94)] p-4 shadow-[0_24px_90px_rgba(4,14,10,0.7)] backdrop-blur-lg max-h-[90dvh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-[0.78rem] font-bold uppercase tracking-[0.11em] text-[#8dffc0]">Reservation Modal</p>
                <h3 className="m-0 mt-1 text-xl font-bold text-[#f4fff7]">{selectedCourt ? `Book ${selectedCourt.name}` : "Book a Court"}</h3>
              </div>
              <button type="button" onClick={closeReservationModal} className="rounded-md px-2 py-1 text-sm font-bold text-[#baf9d4] hover:bg-[rgba(112,255,179,0.12)]">
                Close
              </button>
            </div>

            <form onSubmit={onSubmit} className="grid items-start gap-4 md:grid-cols-2 md:gap-5">
              <div className="grid gap-[0.8rem]">
                <label className={fieldLabelClassName}>
                  <span>Full Name</span>
                  <input
                    className={inputClassName}
                    required
                    minLength={2}
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Alex Gonzalez"
                  />
                </label>

                <label className={fieldLabelClassName}>
                  <span>Contact Number</span>
                  <input
                    className={inputClassName}
                    required
                    minLength={7}
                    value={form.contactNumber}
                    onChange={(event) => setForm((prev) => ({ ...prev, contactNumber: event.target.value }))}
                    placeholder="0917 123 4567"
                  />
                </label>

                <label className={fieldLabelClassName}>
                  <span>Gmail Address</span>
                  <input
                    className={inputClassName}
                    required
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="you@gmail.com"
                  />
                </label>
              </div>

              <div className="grid gap-[0.8rem]">
                <label className={fieldLabelClassName}>
                  <span>Booking Date</span>
                  <input
                    className={inputClassName}
                    required
                    type="date"
                    value={form.bookingDate}
                    onChange={(event) => onDateChange(event.target.value)}
                  />
                </label>

                <label className={fieldLabelClassName}>
                  <span>Court</span>
                  <select
                    className={inputClassName}
                    required
                    value={form.courtId}
                    onChange={(event) => setForm((prev) => ({ ...prev, courtId: event.target.value }))}
                  >
                    {courts.map((court) => (
                      <option key={court.id} value={court.id}>
                        {court.name} ({court.surfaceType})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-[0.7rem]">
                  <label className={fieldLabelClassName}>
                    <span>Start Time</span>
                    <input
                      className={inputClassName}
                      required
                      type="time"
                      value={form.startTime}
                      onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                    />
                  </label>

                  <label className={fieldLabelClassName}>
                    <span>End Time</span>
                    <input
                      className={inputClassName}
                      required
                      type="time"
                      value={form.endTime}
                      onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                    />
                  </label>
                </div>

              </div>

              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="mt-1 cursor-pointer rounded-full border-none bg-[linear-gradient(90deg,#32cc70_0%,#5df28d_100%)] px-4 py-3 text-[0.95rem] font-extrabold text-[#03230f] transition-[transform,box-shadow,opacity] duration-200 ease-in hover:-translate-y-px hover:shadow-[0_10px_26px_rgba(50,204,112,0.36)] disabled:cursor-not-allowed disabled:opacity-55 md:col-span-2"
              >
                {isSubmitting ? "Submitting..." : "Request Booking"}
              </button>
            </form>

            <h4 className="mt-5 mb-0 text-sm font-bold text-[#ccffdf]">Booked Slots for Selected Court</h4>
            {courtBookings.length === 0 ? (
              <p className="mt-2 mb-0 text-[0.9rem] text-[#9fe7bf]">No bookings yet for this date and court.</p>
            ) : (
              <ul className="mt-2 grid list-none gap-[0.55rem] p-0">
                {courtBookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex items-center justify-between rounded-[0.8rem] border border-[rgba(119,255,187,0.16)] bg-[rgba(14,38,26,0.62)] px-3 py-[0.68rem] text-[#d6ffe7]"
                  >
                    <span>
                      {booking.startTime} - {booking.endTime}
                    </span>
                    <strong>{booking.status}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
