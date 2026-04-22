import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { CourtModel } from "@/lib/server/graphql/models/Court";
import { BlockedSlotModel } from "@/lib/server/graphql/models/BlockedSlot";
import { findOverlappingBlockedSlot } from "@/lib/server/graphql/lib/blocked-slots";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";
import { triggerBlockedSlotsUpdated } from "@/lib/server/pusher-server";
import { isValidBlockedSlotTimeRange } from "@/lib/shared/blocked-slot-time";

const createSchema = z
  .object({
    courtId: z.string().min(1).optional(),
    courtIds: z.array(z.string().min(1)).max(100).optional(),
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    bookingDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    reason: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const hasCourtId = Boolean(value.courtId);
    const hasCourtIds = Array.isArray(value.courtIds) && value.courtIds.length > 0;
    const hasBookingDate = Boolean(value.bookingDate);
    const hasBookingDates = Array.isArray(value.bookingDates) && value.bookingDates.length > 0;

    if (!hasCourtId && !hasCourtIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "courtId or courtIds is required",
        path: ["courtIds"],
      });
    }

    if (!hasBookingDate && !hasBookingDates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bookingDate or bookingDates is required",
        path: ["bookingDates"],
      });
    }

    if (!isValidBlockedSlotTimeRange(value.startTime, value.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endTime must be after startTime unless it ends at 12:00 AM",
        path: ["endTime"],
      });
    }
  });

export async function GET(request: Request): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const params = new URL(request.url).searchParams;
    const bookingDate = params.get("bookingDate") ?? undefined;
    const courtId = params.get("courtId") ?? undefined;

    const query: Record<string, string> = {};
    if (bookingDate) {
      query.bookingDate = bookingDate;
    }
    if (courtId) {
      query.courtId = courtId;
    }

    const blockedSlots = await BlockedSlotModel.find(query).sort({ bookingDate: 1, startTime: 1, createdAt: -1 });
    return Response.json({ data: blockedSlots });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch blocked slots") } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    const session = await requireAdminSession();

    const body = createSchema.parse(await request.json());
    const courtIds = Array.from(
      new Set([...(body.courtIds ?? []), ...(body.courtId ? [body.courtId] : [])])
    );
    const bookingDates = Array.from(
      new Set([...(body.bookingDates ?? []), ...(body.bookingDate ? [body.bookingDate] : [])])
    ).sort();

    const courts = await CourtModel.find({ _id: { $in: courtIds } }).select("_id");
    const foundCourtIds = new Set(courts.map((court) => String(court._id)));
    const missingCourtIds = courtIds.filter((id) => !foundCourtIds.has(id));

    if (missingCourtIds.length > 0) {
      return Response.json(
        { error: { message: `Court not found: ${missingCourtIds.join(", ")}` } },
        { status: 404 }
      );
    }

    const created: unknown[] = [];
    const skipped: Array<{ courtId: string; bookingDate: string; reason: string }> = [];

    for (const bookingDate of bookingDates) {
      for (const courtId of courtIds) {
        const overlap = await findOverlappingBlockedSlot({
          courtId,
          bookingDate,
          startTime: body.startTime,
          endTime: body.endTime,
        });

        if (overlap) {
          skipped.push({
            courtId,
            bookingDate,
            reason: "Overlaps an existing blocked range",
          });
          continue;
        }

        const blockedSlot = await BlockedSlotModel.create({
          courtId,
          bookingDate,
          startTime: body.startTime,
          endTime: body.endTime,
          reason: body.reason?.trim() || null,
          createdByUserId: session.userId,
        });

        created.push(blockedSlot);
      }
    }

    if (created.length === 0) {
      return Response.json(
        {
          error: {
            message: "No blocked slots were created because all selected courts had overlapping blocked ranges",
          },
          data: {
            created,
            skipped,
          },
        },
        { status: 409 }
      );
    }

    await triggerBlockedSlotsUpdated({
      action: "created",
      count: created.length,
    });

    return Response.json(
      {
        data: {
          created,
          skipped,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Create failed") } },
      { status: 400 }
    );
  }
}
