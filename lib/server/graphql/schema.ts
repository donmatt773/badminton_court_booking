import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "@/lib/server/graphql/typedefs/schema";
import { resolvers } from "@/lib/server/graphql/resolvers";

export const graphqlSchema = makeExecutableSchema({
  typeDefs,
  resolvers,
});
