import { BookingModel } from "@/lib/server/graphql/models/Booking";
import { CourtModel } from "@/lib/server/graphql/models/Court";
import { computeBookingPricing } from "@/lib/server/bookings/pricing";

let hasMigratedLegacyBookings = false;

type LegacyBookingSnapshotCandidate = {
  _id: { toString(): string };
  courtId: string;
  startTime: string;
  endTime: string;
  appliedHourlyRate?: number | null;
};

async function backfillBookingPricingSnapshots(): Promise<void> {
  const [courts, legacyBookings] = await Promise.all([
    CourtModel.find({}).select("_id price").lean<Array<{ _id: { toString(): string }; price?: number | null }>>(),
    BookingModel.find({
      $or: [
        { appliedHourlyRate: { $exists: false } },
        { appliedHourlyRate: null },
        { durationHours: { $exists: false } },
        { durationHours: null },
        { chargedAmount: { $exists: false } },
        { chargedAmount: null },
      ],
    })
      .select("_id courtId startTime endTime appliedHourlyRate")
      .lean<Array<LegacyBookingSnapshotCandidate>>(),
  ]);

  if (legacyBookings.length === 0) {
    return;
  }

  const courtRateMap = new Map(courts.map((court) => [String(court._id), court.price ?? 0]));
  const operations = legacyBookings.map((booking) => {
    const appliedHourlyRate =
      typeof booking.appliedHourlyRate === "number"
        ? booking.appliedHourlyRate
        : (courtRateMap.get(String(booking.courtId)) ?? 0);

    return {
      updateOne: {
        filter: { _id: booking._id },
        update: {
          $set: {
            ...computeBookingPricing(appliedHourlyRate, booking.startTime, booking.endTime),
            pricingSnapshotSource: "backfilled_current_court_rate",
          },
        },
      },
    };
  });

  if (operations.length > 0) {
    await BookingModel.bulkWrite(operations);
  }
}

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

  await backfillBookingPricingSnapshots();

  hasMigratedLegacyBookings = true;
}
