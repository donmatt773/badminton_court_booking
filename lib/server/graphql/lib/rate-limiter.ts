const counters = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ipAddress: string, maxPerMinute: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const existing = counters.get(ipAddress);

  if (!existing || now > existing.resetAt) {
    counters.set(ipAddress, {
      count: 1,
      resetAt: now + 60_000,
    });

    return {
      allowed: true,
      remaining: maxPerMinute - 1,
    };
  }

  existing.count += 1;

  if (existing.count > maxPerMinute) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    remaining: maxPerMinute - existing.count,
  };
}
