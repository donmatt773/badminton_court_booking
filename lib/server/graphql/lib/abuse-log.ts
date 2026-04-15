import { AbuseLogModel } from "@/lib/server/graphql/models/AbuseLog";
import { EVENTS } from "@/lib/server/graphql/lib/events";
import { pubSub } from "@/lib/server/graphql/lib/pubsub";

type AbuseType = "RATE_LIMIT" | "DUPLICATE_BOOKING" | "SLOT_TAKEN" | "SUSPICIOUS_ACTIVITY";

export async function logAbuseEvent(input: {
  ipAddress: string;
  abuseType: AbuseType;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const abuseLog = await AbuseLogModel.create({
    ipAddress: input.ipAddress,
    abuseType: input.abuseType,
    message: input.message,
    metadata: input.metadata,
  });

  await pubSub.publish(EVENTS.ABUSE_EVENT, {
    abuseEvent: abuseLog,
  });
}
