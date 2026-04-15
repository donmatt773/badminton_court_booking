import { BookingModel } from "@/lib/server/graphql/models/Booking";

let hasMigratedLegacyBookings = false;

export async function migrateLegacyBookings(): Promise<void> {
  if (hasMigratedLegacyBookings) {
    return;
  }

  await BookingModel.collection.updateMany(
    { status: "CONTACTED" },
    {
      $set: {
        status: "PENDING",
      },
    }
  );

  await BookingModel.collection.updateMany(
    {
      $or: [{ denialReason: { $exists: false } }, { denialReason: null }],
    },
    {
      $set: {
        denialReason: null,
      },
    }
  );

  hasMigratedLegacyBookings = true;
}
