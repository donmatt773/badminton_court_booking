import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { getAdminSession } from "@/lib/server/admin-session";
import { UserModel } from "@/lib/server/graphql/models/User";

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
