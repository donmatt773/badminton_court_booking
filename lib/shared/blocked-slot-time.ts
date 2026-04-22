const MINUTES_PER_DAY = 24 * 60;

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

function normalizeBlockedSlotEndMinutes(startTime: string, endTime: string): number {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (endMinutes === 0 && startMinutes > 0) {
    return MINUTES_PER_DAY;
  }

  return endMinutes;
}

export function isValidBlockedSlotTimeRange(startTime: string, endTime: string): boolean {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = normalizeBlockedSlotEndMinutes(startTime, endTime);

  return endMinutes > startMinutes;
}

export function blockedSlotRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const startAMinutes = timeToMinutes(startA);
  const endAMinutes = normalizeBlockedSlotEndMinutes(startA, endA);
  const startBMinutes = timeToMinutes(startB);
  const endBMinutes = normalizeBlockedSlotEndMinutes(startB, endB);

  return startAMinutes < endBMinutes && endAMinutes > startBMinutes;
}