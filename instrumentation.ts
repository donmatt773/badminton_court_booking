export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { ensureGraphQLRuntimeStarted } = await import("@/lib/server/graphql/runtime");
  await ensureGraphQLRuntimeStarted();
}
