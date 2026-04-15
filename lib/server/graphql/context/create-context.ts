import type { NextRequest } from "next/server";

export type GraphQLContext = {
  ipAddress: string;
  adminKey?: string;
  request: Request;
};

export function createContextFromRequest(request: NextRequest): GraphQLContext {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  const adminKey = request.headers.get("x-admin-key") ?? undefined;

  return {
    ipAddress: xForwardedFor?.split(",")[0]?.trim() ?? "unknown",
    adminKey,
    request,
  };
}
