import type { Booking, ListBookingsFilters } from "@/lib/server/bookings/types";

export interface BookingRepository {
  create(booking: Booking): Promise<Booking>;
  findById(id: string): Promise<Booking | null>;
  list(filters?: ListBookingsFilters): Promise<Booking[]>;
}

class InMemoryBookingRepository implements BookingRepository {
  private readonly records = new Map<string, Booking>();

  async create(booking: Booking): Promise<Booking> {
    this.records.set(booking.id, booking);
    return booking;
  }

  async findById(id: string): Promise<Booking | null> {
    return this.records.get(id) ?? null;
  }

  async list(filters?: ListBookingsFilters): Promise<Booking[]> {
    const all = Array.from(this.records.values());

    if (!filters) {
      return all;
    }

    return all.filter((booking) => {
      if (filters.courtId && booking.courtId !== filters.courtId) {
        return false;
      }

      if (filters.status && booking.status !== filters.status) {
        return false;
      }

      return true;
    });
  }
}

const globalForBookings = globalThis as {
  bookingRepository?: BookingRepository;
};

export function getBookingRepository(): BookingRepository {
  if (!globalForBookings.bookingRepository) {
    globalForBookings.bookingRepository = new InMemoryBookingRepository();
  }

  return globalForBookings.bookingRepository;
}
