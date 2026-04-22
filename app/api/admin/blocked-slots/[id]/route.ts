import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { BlockedSlotModel } from "@/lib/server/graphql/models/BlockedSlot";
import { CourtModel } from "@/lib/server/graphql/models/Court";
import { triggerBlockedSlotsUpdated } from "@/lib/server/pusher-server";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";
import { z } from "zod";

const updateSessionSchema = z.object({
  action: z.enum(["begin", "end"]),
});

const patchSchema = z.object({
  groupName: z.string().trim().min(2).max(120).optional(),
  groupRepresentative: z.string().trim().min(2).max(120).optional(),
  reason: z.string().trim().max(200).nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeDurationHours(startedAt: Date, endedAt: Date): number {
  const milliseconds = endedAt.getTime() - startedAt.getTime();
  return roundToTwoDecimals(Math.max(0, milliseconds / (1000 * 60 * 60)));
}

function todayISODateLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayISODateCutoff(): string {
  const localDate = todayISODateLocal();
  const utcDate = new Date().toISOString().slice(0, 10);
  return localDate > utcDate ? localDate : utcDate;
}

function addOneDay(dateText: string): string {
  const base = new Date(`${dateText}T00:00:00`);
  base.setDate(base.getDate() + 1);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const body = updateSessionSchema.parse(await request.json());
    const { id } = await context.params;
    const blockedSlot = await BlockedSlotModel.findById(id);

    if (!blockedSlot) {
      return Response.json({ error: { message: "Blocked record not found" } }, { status: 404 });
    }

    if (body.action === "begin") {
      if (blockedSlot.sessionStartedAt && !blockedSlot.sessionEndedAt) {
        return Response.json({ error: { message: "Session already started" } }, { status: 400 });
      }

      if (blockedSlot.bookingDate > todayISODateCutoff()) {
        return Response.json({ error: { message: "Cannot begin a future scheduled session yet" } }, { status: 400 });
      }

      const court = await CourtModel.findById(blockedSlot.courtId);
      const hourlyRateSnapshot = Math.max(0, court?.price ?? 0);
      const now = new Date();

      const updatedBeginRecord = await BlockedSlotModel.findByIdAndUpdate(
        id,
        {
          $set: {
            sessionStartedAt: now,
            sessionEndedAt: null,
            hourlyRateSnapshot,
            actualDurationHours: null,
            chargedAmount: null,
          },
        },
        { new: true }
      );

      if (!updatedBeginRecord) {
        return Response.json({ error: { message: "Blocked record not found" } }, { status: 404 });
      }

      await triggerBlockedSlotsUpdated({
        action: "updated",
        blockedSlotId: id,
      });

      return Response.json({ data: updatedBeginRecord });
    }

    if (!blockedSlot.sessionStartedAt) {
      return Response.json({ error: { message: "Session has not started yet" } }, { status: 400 });
    }

    if (blockedSlot.sessionEndedAt) {
      return Response.json({ error: { message: "Session already ended" } }, { status: 400 });
    }

    const endedAt = new Date();
    const startedAt = new Date(blockedSlot.sessionStartedAt);
    const durationHours = computeDurationHours(startedAt, endedAt);
    const rate = Math.max(0, blockedSlot.hourlyRateSnapshot ?? 0);
    const chargedAmount = roundToTwoDecimals(durationHours * rate);

    const recurrenceUntilDate = blockedSlot.recurrenceUntilDate
      ? String(blockedSlot.recurrenceUntilDate)
      : null;

    if (recurrenceUntilDate && blockedSlot.bookingDate < recurrenceUntilDate) {
      const nextBookingDate = addOneDay(String(blockedSlot.bookingDate));

      const existingNextRecord = await BlockedSlotModel.findOne({
        courtId: blockedSlot.courtId,
        bookingDate: nextBookingDate,
        startTime: blockedSlot.startTime,
        endTime: blockedSlot.endTime,
        groupName: blockedSlot.groupName ?? null,
        groupRepresentative: blockedSlot.groupRepresentative ?? null,
        sessionStartedAt: null,
        sessionEndedAt: null,
      });

      if (!existingNextRecord) {
        await BlockedSlotModel.create({
          courtId: blockedSlot.courtId,
          bookingDate: nextBookingDate,
          recurrenceUntilDate,
          startTime: blockedSlot.startTime,
          endTime: blockedSlot.endTime,
          groupName: blockedSlot.groupName ?? null,
          groupRepresentative: blockedSlot.groupRepresentative ?? null,
          reason: blockedSlot.reason ?? null,
          createdByUserId: blockedSlot.createdByUserId ?? null,
        });
      }

      await BlockedSlotModel.findByIdAndUpdate(id, {
        $set: {
          recurrenceUntilDate: null,
        },
      });
    }

    const updatedEndRecord = await BlockedSlotModel.findByIdAndUpdate(
      id,
      {
        $set: {
          sessionEndedAt: endedAt,
          actualDurationHours: durationHours,
          chargedAmount,
        },
      },
      { new: true }
    );

    if (!updatedEndRecord) {
      return Response.json({ error: { message: "Blocked record not found" } }, { status: 404 });
    }

    await triggerBlockedSlotsUpdated({
      action: "updated",
      blockedSlotId: id,
    });

    return Response.json({ data: updatedEndRecord });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to update blocked record session") } },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const body = patchSchema.parse(await request.json());
    const { id } = await context.params;
    const blockedSlot = await BlockedSlotModel.findById(id);

    if (!blockedSlot) {
      return Response.json({ error: { message: "Blocked record not found" } }, { status: 404 });
    }

    const isSessionActive = !!blockedSlot.sessionStartedAt;

    const updateFields: Record<string, unknown> = {};

    if (body.groupName !== undefined) updateFields.groupName = body.groupName;
    if (body.groupRepresentative !== undefined) updateFields.groupRepresentative = body.groupRepresentative;
    if (body.reason !== undefined) updateFields.reason = body.reason ?? null;

    if (body.startTime !== undefined || body.endTime !== undefined || body.bookingDate !== undefined) {
      if (isSessionActive) {
        return Response.json(
          { error: { message: "Cannot change time or date after a session has started" } },
          { status: 400 }
        );
      }

      if (body.startTime !== undefined) updateFields.startTime = body.startTime;
      if (body.endTime !== undefined) updateFields.endTime = body.endTime;
      if (body.bookingDate !== undefined) updateFields.bookingDate = body.bookingDate;
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: { message: "No fields to update" } }, { status: 400 });
    }

    const updated = await BlockedSlotModel.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    );

    if (!updated) {
      return Response.json({ error: { message: "Blocked record not found" } }, { status: 404 });
    }

    await triggerBlockedSlotsUpdated({ action: "updated", blockedSlotId: id });

    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to update blocked record") } },
      { status: 400 }
    );
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
    const deleted = await BlockedSlotModel.findByIdAndDelete(id);

    if (!deleted) {
      return Response.json({ error: { message: "Blocked record not found" } }, { status: 404 });
    }

    await triggerBlockedSlotsUpdated({
      action: "deleted",
      blockedSlotId: id,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to delete blocked record") } },
      { status: 500 }
    );
  }
}
