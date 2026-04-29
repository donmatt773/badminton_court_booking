import { GraphQLError } from "graphql";
import GraphQLJSON from "graphql-type-json";
import { graphQLEnv } from "@/lib/server/graphql/config/env";
import { assertAdminKey } from "@/lib/server/graphql/lib/admin-auth";
import { checkRateLimit } from "@/lib/server/graphql/lib/rate-limiter";
import { logAbuseEvent } from "@/lib/server/graphql/lib/abuse-log";
import { BookingModel } from "@/lib/server/graphql/models/Booking";
import { CustomerModel } from "@/lib/server/graphql/models/Customer";
import { CourtModel } from "@/lib/server/graphql/models/Court";
import { AbuseLogModel } from "@/lib/server/graphql/models/AbuseLog";
import { BlockedSlotModel } from "@/lib/server/graphql/models/BlockedSlot";
import { findOverlappingBlockedSlot, doesRecurringSlotApplyOnDate } from "@/lib/server/graphql/lib/blocked-slots";
import { triggerBookingsUpdated } from "@/lib/server/pusher-server";
import { EVENTS } from "@/lib/server/graphql/lib/events";
import { pubSub } from "@/lib/server/graphql/lib/pubsub";
import { computeBookingPricing } from "@/lib/server/bookings/pricing";
import {
  assertValidTimeRange,
  createBookingSchema,
  recordPaymentSchema,
  updateBookingStatusSchema,
} from "@/lib/server/graphql/schemas/booking";
import type { GraphQLContext } from "@/lib/server/graphql/context/create-context";

const activeStatuses = ["CONFIRMED", "PAID", "APPROVED"];
const duplicateGuardStatuses = ["PENDING", "CONFIRMED", "PAID", "APPROVED"];

function toGraphQLError(error: unknown): GraphQLError {
  if (error instanceof GraphQLError) {
    return error;
  }

  if (error instanceof Error) {
    return new GraphQLError(error.message, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return new GraphQLError("Unexpected error", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
}

async function getBookingOrThrow(bookingId: string) {
  const booking = await BookingModel.findById(bookingId);

  if (!booking) {
    throw new GraphQLError("Booking not found", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  return booking;
}

export const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    bookings: async (_parent: unknown, args: { bookingDate?: string; courtId?: string }) => {
      const query: Record<string, unknown> = {};

      if (args.bookingDate) {
        query.bookingDate = args.bookingDate;
      }

      if (args.courtId) {
        query.courtId = args.courtId;
      }

      return BookingModel.find(query).sort({ createdAt: -1 }).populate("customer");
    },
    blockedSlots: async (_parent: unknown, args: { bookingDate?: string; courtId?: string }) => {
      const query: Record<string, unknown> = {};

      if (args.courtId) {
        query.courtId = args.courtId;
      }

      if (args.bookingDate) {
        query.$or = [
          { bookingDate: args.bookingDate },
          {
            recurrenceUntilDate: { $ne: null },
            bookingDate: { $lte: args.bookingDate },
            recurrenceUntilDate: { $gte: args.bookingDate },
            sessionEndedAt: null,
          },
        ];
      }

      const slots = await BlockedSlotModel.find(query).sort({ bookingDate: 1, startTime: 1, createdAt: -1 });

      if (!args.bookingDate) {
        return slots;
      }

      // For recurring slots returned via range, filter out those whose weekday
      // pattern does not include the queried date's weekday.
      return slots.filter((slot) => {
        if (String(slot.bookingDate) === args.bookingDate) {
          return true;
        }
        return doesRecurringSlotApplyOnDate(slot, args.bookingDate!);
      });
    },
    courts: async () => {
      const courts = await CourtModel.find({ status: "active" });
      return courts.sort((a, b) =>
        String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" })
      );
    },
    abuseLogs: async (
      _parent: unknown,
      args: { limit?: number },
      context: GraphQLContext
    ) => {
      assertAdminKey(context.adminKey);

      const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
      return AbuseLogModel.find({}).sort({ createdAt: -1 }).limit(limit);
    },
  },
  Mutation: {
    createBooking: async (
      _parent: unknown,
      args: { input: unknown },
      context: GraphQLContext
    ) => {
      try {
        const limitResult = checkRateLimit(context.ipAddress, graphQLEnv.RATE_LIMIT_PER_MINUTE);

        if (!limitResult.allowed) {
          await logAbuseEvent({
            ipAddress: context.ipAddress,
            abuseType: "RATE_LIMIT",
            message: "Rate limit exceeded for booking creation",
          });

          throw new GraphQLError("Too many requests", {
            extensions: { code: "TOO_MANY_REQUESTS" },
          });
        }

        const parsed = createBookingSchema.parse(args.input);
        assertValidTimeRange(parsed.startTime, parsed.endTime);

        const now = new Date();
        const nowDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        if (parsed.bookingDate === nowDate && parsed.startTime < nowTime) {
          throw new GraphQLError("Start time cannot be in the past", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const court = await CourtModel.findOne({
          _id: parsed.courtId,
          status: "active",
        });

        if (!court) {
          throw new GraphQLError("Court not found or inactive", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const blockedSlot = await findOverlappingBlockedSlot({
          courtId: parsed.courtId,
          bookingDate: parsed.bookingDate,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
        });

        if (blockedSlot) {
          throw new GraphQLError("This slot is blocked and cannot be booked", {
            extensions: { code: "CONFLICT" },
          });
        }

        const duplicateWindowMs = graphQLEnv.DUPLICATE_WINDOW_MINUTES * 60_000;
        const duplicateWindowStart = new Date(now.getTime() - duplicateWindowMs);

        const duplicateRecent = await BookingModel.findOne({
          bookingDate: parsed.bookingDate,
          courtId: parsed.courtId,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          status: { $in: duplicateGuardStatuses },
        });

        if (duplicateRecent) {
          await logAbuseEvent({
            ipAddress: context.ipAddress,
            abuseType: "SLOT_TAKEN",
            message: "Attempted booking on an unavailable slot",
            metadata: {
              courtId: parsed.courtId,
              bookingDate: parsed.bookingDate,
              startTime: parsed.startTime,
              endTime: parsed.endTime,
            },
          });

          throw new GraphQLError("Slot already taken", {
            extensions: { code: "CONFLICT" },
          });
        }

        const matchingCustomer = await CustomerModel.findOne({
          $or: [{ contactNumber: parsed.contactNumber }, { email: parsed.email.toLowerCase() }],
        });

        const duplicateContact = matchingCustomer
          ? await BookingModel.findOne({
              customer: matchingCustomer._id,
              createdAt: { $gte: duplicateWindowStart },
              status: { $in: duplicateGuardStatuses },
            })
          : null;

        if (duplicateContact) {
          await logAbuseEvent({
            ipAddress: context.ipAddress,
            abuseType: "DUPLICATE_BOOKING",
            message: "Repeated booking attempt from same contact",
            metadata: {
              customerName: parsed.name,
              email: parsed.email,
              contactNumber: parsed.contactNumber,
              windowMinutes: graphQLEnv.DUPLICATE_WINDOW_MINUTES,
            },
          });

          throw new GraphQLError("Duplicate booking attempt", {
            extensions: { code: "CONFLICT" },
          });
        }

        let customer = matchingCustomer;

        if (!customer) {
          customer = await CustomerModel.create({
            name: parsed.name,
            contactNumber: parsed.contactNumber,
            email: parsed.email.toLowerCase(),
          });
        } else {
          customer.name = parsed.name;
          customer.email = parsed.email.toLowerCase();
          customer.contactNumber = parsed.contactNumber;
          await customer.save();
        }

        const expiresAt = new Date(now.getTime() + graphQLEnv.PENDING_EXPIRY_MINUTES * 60_000);
        const pricing = computeBookingPricing(court.price ?? 0, parsed.startTime, parsed.endTime);

        const booking = await BookingModel.create({
          customer: customer._id,
          courtId: String(court._id),
          bookingDate: parsed.bookingDate,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          appliedHourlyRate: pricing.appliedHourlyRate,
          durationHours: pricing.durationHours,
          chargedAmount: pricing.chargedAmount,
          pricingSnapshotSource: "captured_at_booking",
          status: "PENDING",
          expiresAt,
          ...(parsed.paymentMethod ? { paymentMethod: parsed.paymentMethod } : {}),
          ...(parsed.paymentProofImage ? { paymentProofImage: parsed.paymentProofImage } : {}),
          ...(parsed.paymentReference ? { paymentReference: parsed.paymentReference } : {}),
        });

        const populated = await booking.populate("customer");

        await pubSub.publish(EVENTS.BOOKING_CREATED, {
          bookingCreated: populated,
        });

        await triggerBookingsUpdated({
          bookingId: String(booking._id),
          action: "created",
        });

        return populated;
      } catch (error) {
        throw toGraphQLError(error);
      }
    },
    updateBookingStatus: async (
      _parent: unknown,
      args: { bookingId: string; status: string; denialReason?: string; confirmDenied?: boolean },
      context: GraphQLContext
    ) => {
      try {
        assertAdminKey(context.adminKey);

        const parsed = updateBookingStatusSchema.parse({
          bookingId: args.bookingId,
          status: args.status,
          denialReason: args.denialReason,
          confirmDenied: args.confirmDenied,
        });

        const booking = await getBookingOrThrow(parsed.bookingId);

        if (activeStatuses.includes(parsed.status)) {
          const conflict = await BookingModel.findOne({
            _id: { $ne: booking._id },
            courtId: booking.courtId,
            bookingDate: booking.bookingDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            status: { $in: activeStatuses },
          });

          if (conflict) {
            await logAbuseEvent({
              ipAddress: context.ipAddress,
              abuseType: "SUSPICIOUS_ACTIVITY",
              message: "Attempt to activate booking on already active slot",
              metadata: {
                bookingId: parsed.bookingId,
                slot: `${booking.bookingDate} ${booking.startTime}-${booking.endTime}`,
              },
            });

            throw new GraphQLError("Cannot activate booking; slot already active", {
              extensions: { code: "CONFLICT" },
            });
          }
        }

        booking.status = parsed.status;
        booking.denialReason = parsed.status === "DENIED" ? (parsed.denialReason ?? null) : null;
        await booking.save();

        const populated = await booking.populate("customer");

        await pubSub.publish(EVENTS.BOOKING_UPDATED, {
          bookingUpdated: populated,
        });

        await triggerBookingsUpdated({
          bookingId: parsed.bookingId,
          action: "updated",
        });

        return populated;
      } catch (error) {
        throw toGraphQLError(error);
      }
    },
    recordPaymentReference: async (
      _parent: unknown,
      args: { bookingId: string; paymentReference: string },
      context: GraphQLContext
    ) => {
      try {
        assertAdminKey(context.adminKey);

        const parsed = recordPaymentSchema.parse({
          bookingId: args.bookingId,
          paymentReference: args.paymentReference,
        });

        const booking = await getBookingOrThrow(parsed.bookingId);

        booking.paymentReference = parsed.paymentReference;
        booking.status = "PAID";

        await booking.save();

        const populated = await booking.populate("customer");

        await pubSub.publish(EVENTS.BOOKING_UPDATED, {
          bookingUpdated: populated,
        });

        await triggerBookingsUpdated({
          bookingId: parsed.bookingId,
          action: "updated",
        });

        return populated;
      } catch (error) {
        throw toGraphQLError(error);
      }
    },
  },
  Subscription: {
    bookingCreated: {
      subscribe: () => pubSub.asyncIterator([EVENTS.BOOKING_CREATED]),
    },
    bookingUpdated: {
      subscribe: () => pubSub.asyncIterator([EVENTS.BOOKING_UPDATED]),
    },
    abuseEvent: {
      subscribe: (_parent: unknown, _args: unknown, context: GraphQLContext) => {
        assertAdminKey(context.adminKey);
        return pubSub.asyncIterator([EVENTS.ABUSE_EVENT]);
      },
    },
  },
};
