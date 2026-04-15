import { Schema, model, models } from "mongoose";

const abuseLogSchema = new Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      trim: true,
    },
    abuseType: {
      type: String,
      enum: ["RATE_LIMIT", "DUPLICATE_BOOKING", "SLOT_TAKEN", "SUSPICIOUS_ACTIVITY"],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

abuseLogSchema.index({ createdAt: -1 });

export const AbuseLogModel = models.AbuseLog ?? model("AbuseLog", abuseLogSchema);
