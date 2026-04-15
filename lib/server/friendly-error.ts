import { ZodError } from "zod";

export function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];

    if (!firstIssue) {
      return fallback;
    }

    if (firstIssue.code === "invalid_string" && firstIssue.validation === "email") {
      return "Invalid email";
    }

    return firstIssue.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
