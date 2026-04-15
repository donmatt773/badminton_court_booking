import { compare } from "bcryptjs";
import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { UserModel } from "@/lib/server/graphql/models/User";
import { createAdminSession } from "@/lib/server/admin-session";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();

    const body = await request.json();
    const parsed = loginSchema.parse(body);

    const user = await UserModel.findOne({ username: parsed.username.toLowerCase() }).select("+passwordHash");

    if (!user || !user.passwordHash || !user.isActive) {
      return Response.json({ error: { message: "Invalid credentials" } }, { status: 401 });
    }

    const isValid = await compare(parsed.password, user.passwordHash as string);

    if (!isValid) {
      return Response.json({ error: { message: "Invalid credentials" } }, { status: 401 });
    }

    await createAdminSession(String(user._id), user.role as "ADMIN" | "RECEPTIONIST");

    // Determine redirect URL based on role
    let redirectUrl = "/";
    if (user.role === "ADMIN") {
      redirectUrl = "/admin";
    } else if (user.role === "RECEPTIONIST") {
      redirectUrl = "/receptionist";
    }

    return Response.json({
      data: {
        id: String(user._id),
        username: user.username,
        name: user.name,
        role: user.role,
        redirectUrl,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          message: getFriendlyErrorMessage(error, "Login failed"),
        },
      },
      { status: 400 }
    );
  }
}
