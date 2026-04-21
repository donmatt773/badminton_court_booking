import { hash } from "bcryptjs";
import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { UserModel } from "@/lib/server/graphql/models/User";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

const updateSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(3).optional(),
  name: z.string().min(2).optional(),
  email: z
    .string()
    .email()
    .optional()
    .refine((value) => !value || value.toLowerCase().endsWith("@gmail.com"), {
      message: "Email must be a @gmail.com address",
    }),
  role: z.enum(["ADMIN", "RECEPTIONIST"]).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    const session = await requireAdminSession();
    if (session.role !== "ADMIN") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }

    const { id } = await context.params;
    const user = await UserModel.findById(id).select("-passwordHash");
    if (!user) {
      return Response.json({ error: { message: "User not found" } }, { status: 404 });
    }

    return Response.json({ data: user });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch user") } },
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
    if (session.role !== "ADMIN") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }

    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());

    const updatePayload: Record<string, unknown> = {
      ...body,
    };

    if (body.username) {
      updatePayload.username = body.username.toLowerCase();
    }

    if (body.email) {
      updatePayload.email = body.email.toLowerCase();
    }

    if (body.password) {
      updatePayload.passwordHash = await hash(body.password, 10);
      delete updatePayload.password;
    }

    const user = await UserModel.findByIdAndUpdate(id, updatePayload, { new: true }).select("-passwordHash");
    if (!user) {
      return Response.json({ error: { message: "User not found" } }, { status: 404 });
    }

    return Response.json({ data: user });
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
    const session = await requireAdminSession();
    if (session.role !== "ADMIN") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }

    const { id } = await context.params;
    const deleted = await UserModel.findByIdAndDelete(id);
    if (!deleted) {
      return Response.json({ error: { message: "User not found" } }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to delete user") } },
      { status: 500 }
    );
  }
}
