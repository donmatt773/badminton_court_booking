import { z } from "zod";

export const bookingStatusValues = [
  "pending",
  "confirmed",
  "cancelled",
] as const;

export const createBookingSchema = z.object({
  customerName: z.string().min(2).max(100),
  customerEmail: z
    .string()
    .email()
    .refine((value) => value.toLowerCase().endsWith("@gmail.com"), {
      message: "Email must be a @gmail.com address",
    }),
  courtId: z.string().min(1).max(40),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  notes: z.string().max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export type BookingStatus = (typeof bookingStatusValues)[number];

export type Booking = CreateBookingInput & {
  id: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
};

export type ListBookingsFilters = {
  courtId?: string;
  status?: BookingStatus;
};
