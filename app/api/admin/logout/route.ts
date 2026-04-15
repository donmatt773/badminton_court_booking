import { clearAdminSession } from "@/lib/server/admin-session";

export async function POST(): Promise<Response> {
  await clearAdminSession();
  return Response.json({ data: { ok: true } });
}
