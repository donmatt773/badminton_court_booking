import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { AbuseLogModel } from "@/lib/server/graphql/models/AbuseLog";

export async function GET(): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const logs = await AbuseLogModel.find({}).sort({ createdAt: -1 }).limit(300);
    return Response.json({ data: logs });
  } catch {
    return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }
}
