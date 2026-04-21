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
  price: z.coerce.number().min(0).optional(),
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
    const session = await requireAdminSession();
    if (session.role !== "ADMIN") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }

    const body = createSchema.parse(await request.json());

    const court = await CourtModel.create({
      name: body.name,
      surfaceType: body.surfaceType,
      status: body.status ?? "active",
      price: body.price ?? 0,
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
