import { BlockedSlotModel } from "@/lib/server/graphql/models/BlockedSlot";
import { blockedSlotRangesOverlap } from "@/lib/shared/blocked-slot-time";

export function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return blockedSlotRangesOverlap(startA, endA, startB, endB);
}

function weekdayFromISODate(dateText: string): number {
  return new Date(`${dateText}T00:00:00Z`).getUTCDay();
}

export function doesRecurringSlotApplyOnDate(
  blockedSlot: { recurrenceWeekdays?: number[] | null },
  bookingDate: string
): boolean {
  if (!Array.isArray(blockedSlot.recurrenceWeekdays) || blockedSlot.recurrenceWeekdays.length === 0) {
    return true;
  }

  return blockedSlot.recurrenceWeekdays.includes(weekdayFromISODate(bookingDate));
}

export async function findOverlappingBlockedSlot(input: {
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}) {
  const blockedSlots = await BlockedSlotModel.find({
    courtId: input.courtId,
    $or: [
      { bookingDate: input.bookingDate },
      {
        recurrenceUntilDate: { $ne: null },
        bookingDate: { $lte: input.bookingDate },
        recurrenceUntilDate: { $gte: input.bookingDate },
        sessionEndedAt: null,
      },
    ],
  });

  return blockedSlots.find((blockedSlot) => {
    const appliesOnDate = String(blockedSlot.bookingDate) === input.bookingDate
      || doesRecurringSlotApplyOnDate(blockedSlot, input.bookingDate);
    if (!appliesOnDate) {
      return false;
    }

    return blockedSlotRangesOverlap(input.startTime, input.endTime, blockedSlot.startTime, blockedSlot.endTime);
  }) ?? null;
}
