import { hash } from "bcryptjs";
import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { UserModel } from "@/lib/server/graphql/models/User";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(3),
  name: z.string().min(2),
  email: z
    .string()
    .email()
    .refine((value) => value.toLowerCase().endsWith("@gmail.com"), {
      message: "Email must be a @gmail.com address",
    }),
  role: z.enum(["ADMIN", "RECEPTIONIST"]),
  isActive: z.boolean().optional(),
});

export async function GET(): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    const session = await requireAdminSession();
    if (session.role !== "ADMIN") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }

    const users = await UserModel.find({}).sort({ createdAt: -1 }).select("-passwordHash");
    return Response.json({ data: users });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch users") } },
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
    const passwordHash = await hash(body.password, 10);

    const user = await UserModel.create({
      username: body.username.toLowerCase(),
      name: body.name,
      email: body.email.toLowerCase(),
      role: body.role,
      isActive: body.isActive ?? true,
      passwordHash,
    });

    return Response.json({ data: user }, { status: 201 });
  } catch (error) {
    return Response.json({ error: { message: getFriendlyErrorMessage(error, "Create failed") } }, { status: 400 });
  }
}
