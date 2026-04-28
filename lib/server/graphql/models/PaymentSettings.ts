import { Schema, model, models } from "mongoose";

const paymentSettingsSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    provider: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "GCash",
    },
    accountName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    accountNumber: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    qrImage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const PaymentSettingsModel =
  models.PaymentSettings ?? model("PaymentSettings", paymentSettingsSchema);
