import mongoose from "mongoose";
import { graphQLEnv } from "@/lib/server/graphql/config/env";

const globalForDb = globalThis as {
  graphqlDbPromise?: Promise<typeof mongoose>;
};

export async function ensureDbConnected(): Promise<void> {
  if (!globalForDb.graphqlDbPromise) {
    globalForDb.graphqlDbPromise = mongoose.connect(graphQLEnv.MONGODB_URI);
  }

  await globalForDb.graphqlDbPromise;
}
