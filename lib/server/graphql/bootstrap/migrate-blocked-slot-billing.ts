import { BlockedSlotModel } from "@/lib/server/graphql/models/BlockedSlot";

let hasMigratedBlockedSlotBilling = false;

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeNewChargedAmount(actualDurationHours: number | null, hourlyRateSnapshot: number | null): number | null {
  if (!actualDurationHours || !hourlyRateSnapshot) {
    return null;
  }

  // Billing tiers: ≤1 hour = 1 hour charge, >1 hour = 2 hour charge
  const billedHours = actualDurationHours <= 1 ? 1 : 2;
  return roundToTwoDecimals(billedHours * hourlyRateSnapshot);
}

async function recalculateBlockedSlotCharges(): Promise<void> {
  // Find all completed blocked sessions (those with sessionEndedAt)
  const completedSessions = await BlockedSlotModel.find({
    sessionEndedAt: { $ne: null },
    sessionStartedAt: { $ne: null },
    actualDurationHours: { $ne: null },
    hourlyRateSnapshot: { $ne: null },
  }).lean<
    Array<{
      _id: { toString(): string };
      actualDurationHours: number;
      hourlyRateSnapshot: number;
      chargedAmount?: number | null;
    }>
  >();

  if (completedSessions.length === 0) {
    return;
  }

  const operations = completedSessions.map((session) => {
    const newChargedAmount = computeNewChargedAmount(session.actualDurationHours, session.hourlyRateSnapshot);

    return {
      updateOne: {
        filter: { _id: session._id },
        update: {
          $set: {
            chargedAmount: newChargedAmount,
          },
        },
      },
    };
  });

  if (operations.length > 0) {
    await BlockedSlotModel.bulkWrite(operations);
  }
}

export async function migrateBlockedSlotBilling(): Promise<void> {
  if (hasMigratedBlockedSlotBilling) {
    return;
  }

  hasMigratedBlockedSlotBilling = true;

  try {
    await recalculateBlockedSlotCharges();
  } catch (error) {
    console.error("Failed to migrate blocked slot billing:", error);
    throw error;
  }
}
