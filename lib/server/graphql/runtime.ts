import { ensureDbConnected } from "@/lib/server/graphql/config/db";
import { startPendingExpiryJob } from "@/lib/server/graphql/cron/expire-pending-bookings";
import { seedDefaultAdmin } from "@/lib/server/graphql/bootstrap/seed-default-admin";
import { migrateLegacyCourts } from "@/lib/server/graphql/bootstrap/migrate-legacy-courts";
import { migrateLegacyBookings } from "@/lib/server/graphql/bootstrap/migrate-legacy-bookings";
import { migrateBlockedSlotBilling } from "@/lib/server/graphql/bootstrap/migrate-blocked-slot-billing";

const globalRuntime = globalThis as {
  graphqlRuntimeStarted?: boolean;
  graphqlRuntimePromise?: Promise<void>;
};

export async function ensureGraphQLRuntimeStarted(): Promise<void> {
  if (globalRuntime.graphqlRuntimeStarted) {
    return;
  }

  if (!globalRuntime.graphqlRuntimePromise) {
    globalRuntime.graphqlRuntimePromise = (async () => {
      await ensureDbConnected();
      await migrateLegacyCourts();
      await migrateLegacyBookings();
      await migrateBlockedSlotBilling();
      await seedDefaultAdmin();
      startPendingExpiryJob();
      globalRuntime.graphqlRuntimeStarted = true;
    })();
  }

  await globalRuntime.graphqlRuntimePromise;
}
