import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { AbuseLogModel } from "@/lib/server/graphql/models/AbuseLog";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const { id } = await context.params;
    const deleted = await AbuseLogModel.findByIdAndDelete(id);
    if (!deleted) {
      return Response.json({ error: { message: "Abuse log not found" } }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to delete abuse log") } },
      { status: 500 }
    );
  }
}
