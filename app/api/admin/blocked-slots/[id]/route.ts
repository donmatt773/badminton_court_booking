import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { BlockedSlotModel } from "@/lib/server/graphql/models/BlockedSlot";
import { triggerBlockedSlotsUpdated } from "@/lib/server/pusher-server";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

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
