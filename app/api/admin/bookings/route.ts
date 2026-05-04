import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { BookingModel } from "@/lib/server/graphql/models/Booking";
import { CustomerModel } from "@/lib/server/graphql/models/Customer";
import { CourtModel } from "@/lib/server/graphql/models/Court";
import { findOverlappingBlockedSlot } from "@/lib/server/graphql/lib/blocked-slots";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";
import { triggerBookingsUpdated } from "@/lib/server/pusher-server";
import { computeBookingPricing, resolveCourtHourlyRateForDate } from "@/lib/server/bookings/pricing";

const createSchema = z.object({
  customerId: z.string().min(1),
  courtId: z.string().min(1),
  bookingDate: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  status: z.enum(["PENDING", "CONFIRMED", "PAID", "APPROVED", "EXPIRED", "CANCELLED", "DENIED"]).default("PENDING"),
  denialReason: z.string().trim().min(3).max(300).optional(),
  confirmDenied: z.boolean().optional(),
  paymentReference: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const bookings = await BookingModel.find({}).sort({ createdAt: -1 }).limit(300).populate("customer");
    return Response.json({ data: bookings });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch bookings") } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const body = createSchema.parse(await request.json());

    if (body.status === "DENIED") {
      if (body.confirmDenied !== true || !body.denialReason) {
        return Response.json(
          { error: { message: "DENIED bookings require confirmDenied=true and denialReason" } },
          { status: 400 }
        );
      }
    }
    const customer = await CustomerModel.findById(body.customerId);
    if (!customer) {
      return Response.json({ error: { message: "Customer not found" } }, { status: 404 });
    }

    const court = await CourtModel.findOne({ _id: body.courtId, status: "active" });
    if (!court) {
      return Response.json({ error: { message: "Court not found or inactive" } }, { status: 404 });
    }

    const blockedSlot = await findOverlappingBlockedSlot({
      courtId: body.courtId,
      bookingDate: body.bookingDate,
      startTime: body.startTime,
      endTime: body.endTime,
    });

    if (blockedSlot) {
      return Response.json(
        { error: { message: "Selected slot is blocked and cannot be booked" } },
        { status: 409 }
      );
    }

    const booking = await BookingModel.create({
      customer: customer._id,
      courtId: String(court._id),
      bookingDate: body.bookingDate,
      startTime: body.startTime,
      endTime: body.endTime,
      ...computeBookingPricing(resolveCourtHourlyRateForDate(court, body.bookingDate), body.startTime, body.endTime),
      pricingSnapshotSource: "captured_at_booking",
      status: body.status,
      denialReason: body.status === "DENIED" ? body.denialReason : null,
      paymentReference: body.paymentReference ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 5 * 60 * 60 * 1000),
    });

    const populated = await booking.populate("customer");
    await triggerBookingsUpdated({
      bookingId: String(booking._id),
      action: "created",
    });
    return Response.json({ data: populated }, { status: 201 });
  } catch (error) {
    return Response.json({ error: { message: getFriendlyErrorMessage(error, "Create failed") } }, { status: 400 });
  }
}
