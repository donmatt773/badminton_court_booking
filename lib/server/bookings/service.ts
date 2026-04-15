import { HttpError } from "@/lib/server/http-error";
import { getBookingRepository } from "@/lib/server/bookings/repository";
import {
  bookingStatusValues,
  type Booking,
  createBookingSchema,
  type ListBookingsFilters,
} from "@/lib/server/bookings/types";

const bookingRepository = getBookingRepository();

export async function listBookings(filters?: ListBookingsFilters): Promise<Booking[]> {
  return bookingRepository.list(filters);
}

export async function getBookingById(bookingId: string): Promise<Booking> {
  const booking = await bookingRepository.findById(bookingId);

  if (!booking) {
    throw new HttpError(404, "Booking not found");
  }

  return booking;
}

export async function createBooking(input: unknown): Promise<Booking> {
  const parsedInput = createBookingSchema.parse(input);

  const startDate = new Date(parsedInput.startTime);
  const endDate = new Date(parsedInput.endTime);

  if (endDate <= startDate) {
    throw new HttpError(400, "endTime must be after startTime");
  }

  const now = new Date().toISOString();
  const booking: Booking = {
    id: crypto.randomUUID(),
    status: "pending",
    createdAt: now,
    updatedAt: now,
    ...parsedInput,
  };

  return bookingRepository.create(booking);
}

export function isValidBookingStatus(status: string): status is (typeof bookingStatusValues)[number] {
  return bookingStatusValues.includes(status as (typeof bookingStatusValues)[number]);
}
