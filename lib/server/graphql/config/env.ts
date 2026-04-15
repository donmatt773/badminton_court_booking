import { z } from "zod";

const graphQLEnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  ADMIN_KEY: z.string().min(8).default("dev-admin-key"),
  PENDING_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(180).default(15),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(500).default(10),
  DUPLICATE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(180).default(10),
});

const parsedEnv = graphQLEnvSchema.safeParse({
  MONGODB_URI: process.env.MONGODB_URI,
  ADMIN_KEY: process.env.ADMIN_KEY,
  PENDING_EXPIRY_MINUTES: process.env.PENDING_EXPIRY_MINUTES,
  RATE_LIMIT_PER_MINUTE: process.env.RATE_LIMIT_PER_MINUTE,
  DUPLICATE_WINDOW_MINUTES: process.env.DUPLICATE_WINDOW_MINUTES,
});

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid GraphQL backend environment variables. ${details}`);
}

export const graphQLEnv = parsedEnv.data;
