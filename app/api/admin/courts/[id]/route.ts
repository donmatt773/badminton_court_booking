import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { CourtModel } from "@/lib/server/graphql/models/Court";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  surfaceType: z.enum(["wooden", "rubber"]).optional(),
  status: z.enum(["active", "inactive", "maintenance"]).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const { id } = await context.params;
    const court = await CourtModel.findById(id);

    if (!court) {
      return Response.json({ error: { message: "Court not found" } }, { status: 404 });
    }

    return Response.json({ data: court });
  } catch {
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());

    const court = await CourtModel.findByIdAndUpdate(id, body, { new: true });

    if (!court) {
      return Response.json({ error: { message: "Court not found" } }, { status: 404 });
    }

    return Response.json({ data: court });
  } catch (error) {
    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Update failed") } },
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
    const deleted = await CourtModel.findByIdAndDelete(id);

    if (!deleted) {
      return Response.json({ error: { message: "Court not found" } }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }
}
