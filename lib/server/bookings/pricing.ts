function parseTimeToMinutes(time: string): number {
  const [hoursText, minutesText] = time.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  if (hours === 24 && minutes === 0) {
    return 24 * 60;
  }

  return hours * 60 + minutes;
}

export function computeBookingPricing(hourlyRate: number, startTime: string, endTime: string): {
  appliedHourlyRate: number;
  durationHours: number;
  chargedAmount: number;
} {
  const durationMinutes = Math.max(0, parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime));
  const durationHours = durationMinutes / 60;
  const normalizedRate = Number.isFinite(hourlyRate) ? hourlyRate : 0;
  const chargedAmount = Math.round(durationHours * normalizedRate * 100) / 100;

  return {
    appliedHourlyRate: normalizedRate,
    durationHours,
    chargedAmount,
  };
}