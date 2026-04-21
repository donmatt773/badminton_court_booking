export const typeDefs = `#graphql
  scalar JSON

  enum BookingStatus {
    PENDING
    CONFIRMED
    PAID
    APPROVED
    EXPIRED
    CANCELLED
    DENIED
  }

  enum StaffRole {
    ADMIN
    RECEPTIONIST
  }

  enum AbuseType {
    RATE_LIMIT
    DUPLICATE_BOOKING
    SLOT_TAKEN
    SUSPICIOUS_ACTIVITY
  }

  enum CourtSurfaceType {
    wooden
    rubber
  }

  enum CourtStatus {
    active
    inactive
    maintenance
  }

  type Customer {
    id: ID!
    name: String!
    contactNumber: String!
    email: String!
    createdAt: String!
    updatedAt: String!
  }

  type Booking {
    id: ID!
    customer: Customer!
    courtId: String!
    bookingDate: String!
    startTime: String!
    endTime: String!
    status: BookingStatus!
    paymentReference: String
    denialReason: String
    expiresAt: String!
    createdAt: String!
    updatedAt: String!
  }

  type Court {
    id: ID!
    name: String!
    surfaceType: CourtSurfaceType!
    status: CourtStatus!
    createdAt: String!
    updatedAt: String!
  }

  type BlockedSlot {
    id: ID!
    courtId: String!
    bookingDate: String!
    startTime: String!
    endTime: String!
    reason: String
    createdAt: String!
    updatedAt: String!
  }

  type StaffUser {
    id: ID!
    name: String!
    email: String!
    role: StaffRole!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type AbuseLog {
    id: ID!
    ipAddress: String!
    abuseType: AbuseType!
    message: String!
    metadata: JSON
    createdAt: String!
    updatedAt: String!
  }

  input CreateBookingInput {
    name: String!
    contactNumber: String!
    email: String!
    courtId: String!
    bookingDate: String!
    startTime: String!
    endTime: String!
  }

  type Query {
    bookings(bookingDate: String, courtId: String): [Booking!]!
    blockedSlots(bookingDate: String, courtId: String): [BlockedSlot!]!
    courts: [Court!]!
    abuseLogs(limit: Int = 50): [AbuseLog!]!
  }

  type Mutation {
    createBooking(input: CreateBookingInput!): Booking!
    updateBookingStatus(
      bookingId: ID!
      status: BookingStatus!
      denialReason: String
      confirmDenied: Boolean
    ): Booking!
    recordPaymentReference(bookingId: ID!, paymentReference: String!): Booking!
  }

  type Subscription {
    bookingCreated: Booking!
    bookingUpdated: Booking!
    abuseEvent: AbuseLog!
  }
`;
