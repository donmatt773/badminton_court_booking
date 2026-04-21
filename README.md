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

Optional realtime vars for Pusher:

- `PUSHER_APP_ID`
- `NEXT_PUBLIC_PUSHER_KEY`
- `PUSHER_SECRET`
- `NEXT_PUBLIC_PUSHER_CLUSTER`

If the Pusher vars are not set, Apollo still works and the app falls back to normal request/refresh behavior without realtime pushes.

## Backend Features

- Separate customer table (`name`, `contactNumber`, `email`) with no password/login/JWT.
- Booking lifecycle: `PENDING`, `CONTACTED`, `CONFIRMED`, `PAID`, `APPROVED`, `EXPIRED`, `CANCELLED`.
- Slot conflict prevention and duplicate booking guards.
- Abuse logging (`RATE_LIMIT`, `DUPLICATE_BOOKING`, `SLOT_TAKEN`, `SUSPICIOUS_ACTIVITY`).
- Admin-key protection for privileged operations via `x-admin-key` header.
- Auto-expiry cron job for stale `PENDING` bookings.
- Apollo Client for customer GraphQL pages.
- Realtime invalidation through Pusher channels for booking and blocked-slot updates.

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

Realtime channels:

- `court-bookings`
- `court-blocked-slots`

## Recent Updates

- Customer reservation modal is now a compact 2-step flow:
	- Step 1: date and time selection
	- Step 2: customer details and payment method
- Customer time selection supports minute precision (for example, 4:20) instead of hourly-only slot picking.
- Past-time booking prevention is enforced for today on customer, receptionist, and admin booking flows.
- Receptionist cash payment flow now validates required amount:
	- Cash received cannot be below required booking total.
	- If cash is above required total, a receipt preview modal is shown and must be confirmed.
- Receptionist receipt preview includes a standard structured layout with receipt number, date/time, customer, court, schedule, required amount, amount paid, and change.
