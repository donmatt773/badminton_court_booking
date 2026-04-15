import { ok } from "@/lib/server/api-response";
import { env } from "@/lib/server/env";

export function GET(): Response {
  return ok({
    status: "ok",
    service: "court-booking-api",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
