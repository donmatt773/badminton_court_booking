import { BlockedSlotModel } from "@/lib/server/graphql/models/BlockedSlot";

export function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

export async function findOverlappingBlockedSlot(input: {
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}) {
  return BlockedSlotModel.findOne({
    courtId: input.courtId,
    bookingDate: input.bookingDate,
    startTime: { $lt: input.endTime },
    endTime: { $gt: input.startTime },
  });
}
