import { Schema, model, models } from "mongoose";

const courtSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      unique: true,
    },
    surfaceType: {
      type: String,
      enum: ["wooden", "rubber"],
      required: true,
      default: "rubber",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      required: true,
      default: "active",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    weekdayRate: {
      type: Number,
      min: 0,
      default: null,
    },
    weekendRate: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const existingCourtModel = models.Court;

if (
  existingCourtModel &&
  (existingCourtModel.schema.path("code") ||
    !existingCourtModel.schema.path("surfaceType") ||
    !existingCourtModel.schema.path("status") ||
    !existingCourtModel.schema.path("price"))
) {
  delete models.Court;
}

if (existingCourtModel && !existingCourtModel.schema.path("weekdayRate")) {
  existingCourtModel.schema.add({ weekdayRate: { type: Number, min: 0, default: null } });
}

if (existingCourtModel && !existingCourtModel.schema.path("weekendRate")) {
  existingCourtModel.schema.add({ weekendRate: { type: Number, min: 0, default: null } });
}

export const CourtModel = models.Court ?? model("Court", courtSchema);
