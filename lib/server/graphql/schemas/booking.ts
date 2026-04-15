import { z } from "zod";

export const createBookingSchema = z.object({
  name: z.string().min(2).max(100),
  contactNumber: z.string().min(7).max(25),
  email: z
    .string()
    .email()
    .max(120)
    .refine((value) => value.toLowerCase().endsWith("@gmail.com"), {
      message: "Email must be a @gmail.com address",
    }),
  courtId: z.string().min(1).max(40),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "bookingDate must be YYYY-MM-DD"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "startTime must be HH:mm"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "endTime must be HH:mm"),
});

export const updateBookingStatusSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "PAID",
    "APPROVED",
    "EXPIRED",
    "CANCELLED",
    "DENIED",
  ]),
  denialReason: z.string().trim().min(3).max(300).optional(),
  confirmDenied: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.status === "DENIED") {
    if (value.confirmDenied !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "confirmDenied must be true when status is DENIED",
        path: ["confirmDenied"],
      });
    }

    if (!value.denialReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "denialReason is required when status is DENIED",
        path: ["denialReason"],
      });
    }
  }
});

export const recordPaymentSchema = z.object({
  bookingId: z.string().min(1),
  paymentReference: z.string().min(3).max(80),
});

export function assertValidTimeRange(startTime: string, endTime: string): void {
  if (startTime >= endTime) {
    throw new Error("endTime must be after startTime");
  }
}
