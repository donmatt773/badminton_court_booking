import { GraphQLError } from "graphql";
import { graphQLEnv } from "@/lib/server/graphql/config/env";

export function assertAdminKey(adminKey?: string): void {
  if (!adminKey || adminKey !== graphQLEnv.ADMIN_KEY) {
    throw new GraphQLError("Unauthorized", {
      extensions: { code: "UNAUTHORIZED" },
    });
  }
}
