import { CourtModel } from "@/lib/server/graphql/models/Court";
import type { PipelineStage } from "mongoose";

let hasMigratedLegacyCourts = false;

async function dropLegacyIndexes(): Promise<void> {
  try {
    const indexes = await CourtModel.collection.listIndexes().toArray();
    const legacyIndexNames = indexes
      .filter((index) => {
        const keys = Object.keys(index.key ?? {});
        return keys.some((key) => ["code", "surface", "isActive"].includes(key));
      })
      .map((index) => index.name)
      .filter((name): name is string => Boolean(name && name !== "_id_"));

    for (const indexName of legacyIndexNames) {
      await CourtModel.collection.dropIndex(indexName);
    }
  } catch {
    // Ignore when collection does not exist yet or index was already removed.
  }
}

export async function migrateLegacyCourts(): Promise<void> {
  if (hasMigratedLegacyCourts) {
    return;
  }

  await dropLegacyIndexes();

  // Migrate old court docs that used code/surface/isActive into the new schema.
  await CourtModel.collection.updateMany(
    {
      $or: [{ name: { $exists: false } }, { name: null }, { name: "" }],
    },
    [
      {
        $set: {
          name: {
            $cond: [
              { $and: [{ $ne: ["$code", null] }, { $ne: ["$code", ""] }] },
              { $concat: ["Court ", "$code"] },
              { $concat: ["Court ", { $toString: "$_id" }] },
            ],
          },
        },
      },
    ] as PipelineStage[]
  );

  await CourtModel.collection.updateMany(
    {
      $or: [{ surfaceType: { $exists: false } }, { surfaceType: null }, { surfaceType: "" }],
    },
    [
      {
        $set: {
          surfaceType: {
            $cond: [{ $in: ["$surface", ["wooden", "rubber"]] }, "$surface", "rubber"],
          },
        },
      },
    ] as PipelineStage[]
  );

  await CourtModel.collection.updateMany(
    {
      $or: [{ status: { $exists: false } }, { status: null }, { status: "" }],
    },
    [
      {
        $set: {
          status: {
            $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
          },
        },
      },
    ] as PipelineStage[]
  );

  await CourtModel.collection.updateMany(
    {},
    {
      $unset: {
        code: "",
        surface: "",
        isActive: "",
      },
    }
  );

  hasMigratedLegacyCourts = true;
}
