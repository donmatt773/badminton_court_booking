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

export const BlockedSlotModel = models.BlockedSlot ?? model("BlockedSlot", blockedSlotSchema);
