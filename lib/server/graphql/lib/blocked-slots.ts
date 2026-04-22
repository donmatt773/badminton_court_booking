import { BlockedSlotModel } from "@/lib/server/graphql/models/BlockedSlot";
import { blockedSlotRangesOverlap } from "@/lib/shared/blocked-slot-time";

export function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return blockedSlotRangesOverlap(startA, endA, startB, endB);
}

export async function findOverlappingBlockedSlot(input: {
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}) {
  const blockedSlots = await BlockedSlotModel.find({
    courtId: input.courtId,
    bookingDate: input.bookingDate,
  });

  return blockedSlots.find((blockedSlot) =>
    blockedSlotRangesOverlap(input.startTime, input.endTime, blockedSlot.startTime, blockedSlot.endTime)
  ) ?? null;
}
