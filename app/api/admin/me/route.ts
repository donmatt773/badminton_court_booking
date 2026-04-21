import { hash } from "bcryptjs";
import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { getAdminSession } from "@/lib/server/admin-session";
import { UserModel } from "@/lib/server/graphql/models/User";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

const selfUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  username: z.string().min(3).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6).optional(),
});

export async function GET(): Promise<Response> {
  await ensureGraphQLRuntimeStarted();

  const session = await getAdminSession();
  if (!session) {
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const user = await UserModel.findById(session.userId);
  if (!user || !user.isActive) {
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  return Response.json({
    data: {
      id: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role,
    },
  });
}

export async function PUT(request: Request): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();

    const session = await getAdminSession();
    if (!session) {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    const user = await UserModel.findById(session.userId);
    if (!user || !user.isActive) {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    const body = selfUpdateSchema.parse(await request.json());
    const update: Record<string, unknown> = {};

    if (body.name) update.name = body.name;

    if (body.username) {
      const taken = await UserModel.findOne({
        username: body.username.toLowerCase(),
        _id: { $ne: user._id },
      });
      if (taken) {
        return Response.json({ error: { message: "Username already taken" } }, { status: 409 });
      }
      update.username = body.username.toLowerCase();
    }

    if (body.newPassword) {
      if (!body.currentPassword) {
        return Response.json(
          { error: { message: "Current password is required to set a new password" } },
          { status: 400 }
        );
      }
      const { compare } = await import("bcryptjs");
      const valid = await compare(body.currentPassword, user.passwordHash as string);
      if (!valid) {
        return Response.json({ error: { message: "Current password is incorrect" } }, { status: 400 });
      }
      update.passwordHash = await hash(body.newPassword, 10);
    }

    if (Object.keys(update).length === 0) {
      return Response.json({ error: { message: "Nothing to update" } }, { status: 400 });
    }

    const updated = await UserModel.findByIdAndUpdate(user._id, update, { new: true });
    return Response.json({
      data: {
        id: String(updated!._id),
        username: updated!.username,
        name: updated!.name,
        role: updated!.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: { message: error.errors[0]?.message ?? "Invalid input" } }, { status: 422 });
    }
    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to update profile") } },
      { status: 500 }
    );
  }
}
