import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { BookingModel } from "@/lib/server/graphql/models/Booking";
import { UserModel } from "@/lib/server/graphql/models/User";
import { findOverlappingBlockedSlot } from "@/lib/server/graphql/lib/blocked-slots";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";
import { triggerBookingsUpdated } from "@/lib/server/pusher-server";
import { graphQLEnv } from "@/lib/server/graphql/config/env";

const updateSchema = z.object({
  courtId: z.string().min(1).optional(),
  bookingDate: z.string().min(1).optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  status: z.enum(["PENDING", "CONFIRMED", "PAID", "APPROVED", "EXPIRED", "CANCELLED", "DENIED", "COMPLETE", "ARCHIVED"]).optional(),
  isArchived: z.boolean().optional(),
  denialReason: z.string().trim().min(3).max(300).optional(),
  confirmDenied: z.boolean().optional(),
  paymentReference: z.string().nullable().optional(),
  paymentMethod: z.enum(["cash", "online"]).nullable().optional(),
  paymentProofImage: z.string().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const { id } = await context.params;
    const booking = await BookingModel.findById(id).populate("customer");
    if (!booking) {
      return Response.json({ error: { message: "Booking not found" } }, { status: 404 });
    }

    return Response.json({ data: booking });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch booking") } },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    const session = await requireAdminSession();

    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());

    const existingBooking = await BookingModel.findById(id);
    if (!existingBooking) {
      return Response.json({ error: { message: "Booking not found" } }, { status: 404 });
    }

    if (body.status === "DENIED") {
      if (body.confirmDenied !== true || !body.denialReason) {
        return Response.json(
          { error: { message: "DENIED requires confirmDenied=true and denialReason" } },
          { status: 400 }
        );
      }

      // Only restrict non-admin roles to PENDING → DENIED
      if (session.role !== "ADMIN" && existingBooking.status !== "PENDING") {
        return Response.json(
          { error: { message: "Only PENDING bookings can be denied" } },
          { status: 409 }
        );
      }
    }

    if (session.role === "RECEPTIONIST" && body.status) {
      // Allowed transitions for receptionist:
      //   PENDING  → APPROVED or DENIED
      //   APPROVED → PAID
      const allowedTransitions: Record<string, string[]> = {
        PENDING:   ["APPROVED", "DENIED"],
        APPROVED:  ["PAID"],
        CONFIRMED: ["PAID"],
        PAID:      ["COMPLETE"],
        COMPLETE:  ["ARCHIVED"],
        CANCELLED: ["ARCHIVED"],
        EXPIRED:   ["ARCHIVED"],
        DENIED:    ["ARCHIVED"],
        ARCHIVED:  ["COMPLETE"],
      };
      const currentStatus = existingBooking.status as string;
      const allowed = allowedTransitions[currentStatus] ?? [];
      if (!allowed.includes(body.status)) {
        return Response.json(
          { error: { message: `Receptionist cannot change status from ${currentStatus} to ${body.status}` } },
          { status: 403 }
        );
      }
    }

    // Handle isArchived toggling (preferred over status: "ARCHIVED")
    const archivableStatuses = ["COMPLETE", "CANCELLED", "EXPIRED", "DENIED"];
    if (body.isArchived === true) {
      const currentStatus = existingBooking.status as string;
      if (!archivableStatuses.includes(currentStatus) && currentStatus !== "ARCHIVED") {
        return Response.json(
          { error: { message: `Cannot archive a booking with status ${currentStatus}` } },
          { status: 409 }
        );
      }
    }

    const isSlotMutation =
      body.courtId !== undefined ||
      body.bookingDate !== undefined ||
      body.startTime !== undefined ||
      body.endTime !== undefined;

    if (isSlotMutation) {
      const nextCourtId = body.courtId ?? existingBooking.courtId;
      const nextBookingDate = body.bookingDate ?? existingBooking.bookingDate;
      const nextStartTime = body.startTime ?? existingBooking.startTime;
      const nextEndTime = body.endTime ?? existingBooking.endTime;

      const blockedSlot = await findOverlappingBlockedSlot({
        courtId: nextCourtId,
        bookingDate: nextBookingDate,
        startTime: nextStartTime,
        endTime: nextEndTime,
      });

      if (blockedSlot) {
        return Response.json(
          { error: { message: "Selected slot is blocked and cannot be used" } },
          { status: 409 }
        );
      }
    }

    const updatePayload: Record<string, unknown> = {
      ...body,
    };

    delete updatePayload.confirmDenied;

    if (body.status && body.status !== "DENIED") {
      updatePayload.denialReason = null;
    }

    // When reactivating a booking back to PENDING, reset expiresAt.
    // If admin supplied a custom expiresAt, use it; otherwise default to PENDING_EXPIRY_MINUTES from now.
    if (body.status === "PENDING") {
      updatePayload.expiresAt = body.expiresAt
        ? new Date(body.expiresAt)
        : new Date(Date.now() + graphQLEnv.PENDING_EXPIRY_MINUTES * 60_000);
    }

    // Record which staff member performed the status change
    if (body.status) {
      const actor = await UserModel.findById(session.userId).select("name username").lean();
      if (actor) {
        updatePayload.actionBy = {
          userId:   String(session.userId),
          name:     actor.name as string,
          username: actor.username as string,
        };
      }
    }

    const booking = await BookingModel.findByIdAndUpdate(id, updatePayload, { new: true }).populate("customer");

    await triggerBookingsUpdated({
      bookingId: id,
      action: "updated",
    });

    return Response.json({ data: booking });
  } catch (error) {
    return Response.json({ error: { message: getFriendlyErrorMessage(error, "Update failed") } }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const { id } = await context.params;
    const deleted = await BookingModel.findByIdAndDelete(id);
    if (!deleted) {
      return Response.json({ error: { message: "Booking not found" } }, { status: 404 });
    }

    await triggerBookingsUpdated({
      bookingId: id,
      action: "deleted",
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to delete booking") } },
      { status: 500 }
    );
  }
}
