import cron from "node-cron";
import { BookingModel } from "@/lib/server/graphql/models/Booking";
import { EVENTS } from "@/lib/server/graphql/lib/events";
import { pubSub } from "@/lib/server/graphql/lib/pubsub";

export function startPendingExpiryJob(): void {
  cron.schedule("* * * * *", async () => {
    const now = new Date();

    const pendingBookings = await BookingModel.find({
      status: "PENDING",
      expiresAt: { $lte: now },
    });

    for (const booking of pendingBookings) {
      booking.status = "EXPIRED";
      await booking.save();

      const populated = await booking.populate("customer");
      await pubSub.publish(EVENTS.BOOKING_UPDATED, {
        bookingUpdated: populated,
      });
    }
  });
}
