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

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeDurationHours(startedAt: Date, endedAt: Date): number {
  const milliseconds = endedAt.getTime() - startedAt.getTime();
  return roundToTwoDecimals(Math.max(0, milliseconds / (1000 * 60 * 60)));
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
      return Response.json({ error: { message: "Blocked slot not found" } }, { status: 404 });
    }

    if (body.action === "begin") {
      if (blockedSlot.sessionStartedAt && !blockedSlot.sessionEndedAt) {
        return Response.json({ error: { message: "Session already started" } }, { status: 400 });
      }

      const court = await CourtModel.findById(blockedSlot.courtId);
      const hourlyRateSnapshot = Math.max(0, court?.price ?? 0);
      const now = new Date();

      blockedSlot.sessionStartedAt = now;
      blockedSlot.sessionEndedAt = null;
      blockedSlot.hourlyRateSnapshot = hourlyRateSnapshot;
      blockedSlot.actualDurationHours = null;
      blockedSlot.chargedAmount = null;

      await blockedSlot.save();

      await triggerBlockedSlotsUpdated({
        action: "updated",
        blockedSlotId: id,
      });

      return Response.json({ data: blockedSlot });
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

    blockedSlot.sessionEndedAt = endedAt;
    blockedSlot.actualDurationHours = durationHours;
    blockedSlot.chargedAmount = chargedAmount;

    await blockedSlot.save();

    await triggerBlockedSlotsUpdated({
      action: "updated",
      blockedSlotId: id,
    });

    return Response.json({ data: blockedSlot });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to update blocked slot session") } },
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
      return Response.json({ error: { message: "Blocked slot not found" } }, { status: 404 });
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
      { error: { message: getFriendlyErrorMessage(error, "Failed to delete blocked slot") } },
      { status: 500 }
    );
  }
}
