import { createYoga } from "graphql-yoga";
import type { NextRequest } from "next/server";
import { createContextFromRequest } from "@/lib/server/graphql/context/create-context";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { graphqlSchema } from "@/lib/server/graphql/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yoga = createYoga<{
  req: NextRequest;
}>({
  schema: graphqlSchema,
  graphqlEndpoint: "/api/graphql",
  context: async ({ request }) => createContextFromRequest(request as NextRequest),
});

export async function GET(request: NextRequest): Promise<Response> {
  await ensureGraphQLRuntimeStarted();
  return yoga.handleRequest(request, { req: request });
}

export async function POST(request: NextRequest): Promise<Response> {
  await ensureGraphQLRuntimeStarted();
  return yoga.handleRequest(request, { req: request });
}

export async function OPTIONS(request: NextRequest): Promise<Response> {
  await ensureGraphQLRuntimeStarted();
  return yoga.handleRequest(request, { req: request });
}
