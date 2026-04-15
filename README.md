# Court Booking (Single Dev Server)

Backend is merged into this Next.js app under `lib/server/graphql` and runs with one command.

## Run

```bash
npm install
npm run dev
```

App: `http://localhost:3000`
GraphQL: `http://localhost:3000/api/graphql`
Admin: `http://localhost:3000/admin`

## Environment

Create local env file:

```bash
cp .env.example .env.local
```

Required backend vars:

- `MONGODB_URI`
- `ADMIN_KEY`
- `PENDING_EXPIRY_MINUTES`
- `RATE_LIMIT_PER_MINUTE`
- `DUPLICATE_WINDOW_MINUTES`

## Backend Features

- Separate customer table (`name`, `contactNumber`, `email`) with no password/login/JWT.
- Booking lifecycle: `PENDING`, `CONTACTED`, `CONFIRMED`, `PAID`, `APPROVED`, `EXPIRED`, `CANCELLED`.
- Slot conflict prevention and duplicate booking guards.
- Abuse logging (`RATE_LIMIT`, `DUPLICATE_BOOKING`, `SLOT_TAKEN`, `SUSPICIOUS_ACTIVITY`).
- Admin-key protection for privileged operations via `x-admin-key` header.
- Auto-expiry cron job for stale `PENDING` bookings.
- Real-time subscription events through GraphQL Yoga subscriptions.

## Admin Dashboard

- URL: `http://localhost:3000/admin`
- Default seeded admin credentials:
	- username: `admin`
	- password: `admin`

The default admin user is auto-created at startup if it does not already exist.

## GraphQL Operations

Queries:

- `bookings(bookingDate, courtId)`
- `abuseLogs(limit)` (admin key required)

Mutations:

- `createBooking(input)` (public)
- `updateBookingStatus(bookingId, status)` (admin key required)
- `recordPaymentReference(bookingId, paymentReference)` (admin key required)

Subscriptions:

- `bookingCreated`
- `bookingUpdated`
- `abuseEvent` (admin key required)
