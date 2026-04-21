"use client";

import { ApolloClient, HttpLink, InMemoryCache, type NormalizedCacheObject } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { PropsWithChildren, useState } from "react";

function createApolloClient(): ApolloClient<NormalizedCacheObject> {
  return new ApolloClient({
    link: new HttpLink({ uri: "/api/graphql" }),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: "cache-and-network",
      },
      query: {
        fetchPolicy: "network-only",
      },
    },
  });
}

export function AppApolloProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => createApolloClient());
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
