import { getAdminSession } from "@/lib/server/admin-session";

export async function requireAdminSession(): Promise<{ userId: string; role: "ADMIN" | "RECEPTIONIST" }> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return { userId: session.userId, role: session.role };
}
