import { Schema, model, models } from "mongoose";

const blockedSlotSchema = new Schema(
  {
    courtId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    bookingDate: {
      type: String,
      required: true,
      trim: true,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    groupName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    groupRepresentative: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    recurrenceUntilDate: {
      type: String,
      trim: true,
      default: null,
    },
    recurrenceWeekdays: {
      type: [Number],
      default: null,
    },
    sessionStartedAt: {
      type: Date,
      default: null,
    },
    sessionPausedAt: {
      type: Date,
      default: null,
    },
    sessionEndedAt: {
      type: Date,
      default: null,
    },
    reminderSeenAt: {
      type: Date,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedByUserId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
    hourlyRateSnapshot: {
      type: Number,
      min: 0,
      default: null,
    },
    actualDurationHours: {
      type: Number,
      min: 0,
      default: null,
    },
    chargedAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    createdByUserId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

blockedSlotSchema.index({ courtId: 1, bookingDate: 1, startTime: 1, endTime: 1 });
blockedSlotSchema.index({ bookingDate: 1, createdAt: -1 });

const existingBlockedSlotModel = models.BlockedSlot;

if (existingBlockedSlotModel) {
  if (!existingBlockedSlotModel.schema.path("recurrenceWeekdays")) {
    existingBlockedSlotModel.schema.add({
      recurrenceWeekdays: { type: [Number], default: null },
    });
  }
  if (!existingBlockedSlotModel.schema.path("sessionPausedAt")) {
    existingBlockedSlotModel.schema.add({
      sessionPausedAt: { type: Date, default: null },
    });
  }
  if (!existingBlockedSlotModel.schema.path("reminderSeenAt")) {
    existingBlockedSlotModel.schema.add({
      reminderSeenAt: { type: Date, default: null },
    });
  }
  if (!existingBlockedSlotModel.schema.path("isArchived")) {
    existingBlockedSlotModel.schema.add({
      isArchived: { type: Boolean, default: false },
    });
  }
  if (!existingBlockedSlotModel.schema.path("archivedAt")) {
    existingBlockedSlotModel.schema.add({
      archivedAt: { type: Date, default: null },
    });
  }
  if (!existingBlockedSlotModel.schema.path("archivedByUserId")) {
    existingBlockedSlotModel.schema.add({
      archivedByUserId: { type: String, trim: true, maxlength: 64, default: null },
    });
  }
}

export const BlockedSlotModel = existingBlockedSlotModel ?? model("BlockedSlot", blockedSlotSchema);
