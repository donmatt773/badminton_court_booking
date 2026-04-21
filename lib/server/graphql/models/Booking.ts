import { Schema, model, models } from "mongoose";

export const bookingStatuses = [
  "PENDING",
  "CONFIRMED",
  "PAID",
  "APPROVED",
  "EXPIRED",
  "CANCELLED",
  "DENIED",
  "COMPLETE",
  "ARCHIVED",
] as const;

const bookingSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
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
    status: {
      type: String,
      enum: bookingStatuses,
      default: "PENDING",
      required: true,
    },
    paymentReference: {
      type: String,
      trim: true,
      maxlength: 80,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "online", null],
      default: null,
    },
    paymentProofImage: {
      type: String, // base64 data URL of receipt screenshot
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    denialReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
    actionBy: {
      type: new Schema(
        {
          userId:   { type: String, required: true },
          name:     { type: String, required: true },
          username: { type: String, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ courtId: 1, bookingDate: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: 1 });

export const BookingModel = models.Booking ?? model("Booking", bookingSchema);
