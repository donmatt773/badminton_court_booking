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
    !existingCourtModel.schema.path("status"))
) {
  delete models.Court;
}

export const CourtModel = models.Court ?? model("Court", courtSchema);
