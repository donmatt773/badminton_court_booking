import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { CourtModel } from "@/lib/server/graphql/models/Court";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";
import { triggerCourtsUpdated } from "@/lib/server/pusher-server";

const createSchema = z.object({
  name: z.string().min(2),
  surfaceType: z.enum(["wooden", "rubber"]),
  status: z.enum(["active", "inactive", "maintenance"]).optional(),
});

export async function GET(): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const courts = await CourtModel.find({}).sort({ name: 1 });
    return Response.json({ data: courts });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch courts") } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const body = createSchema.parse(await request.json());

    const court = await CourtModel.create({
      name: body.name,
      surfaceType: body.surfaceType,
      status: body.status ?? "active",
    });

    void triggerCourtsUpdated();
    return Response.json({ data: court }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Create failed") } },
      { status: 400 }
    );
  }
}
