import { PubSub } from "graphql-subscriptions";

const globalForPubSub = globalThis as {
  gqlPubSub?: PubSub;
};

export const pubSub = globalForPubSub.gqlPubSub ?? new PubSub();

if (!globalForPubSub.gqlPubSub) {
  globalForPubSub.gqlPubSub = pubSub;
}
