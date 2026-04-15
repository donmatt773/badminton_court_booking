import { ZodError } from "zod";
import { HttpError } from "@/lib/server/http-error";

type ApiErrorBody = {
  error: {
    message: string;
    details?: unknown;
  };
};

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function created<T>(data: T): Response {
  return Response.json(data, { status: 201 });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        message: "Validation failed",
        details: error.flatten(),
      },
    };

    return Response.json(body, { status: 400 });
  }

  if (error instanceof HttpError) {
    const body: ApiErrorBody = {
      error: {
        message: error.message,
      },
    };

    return Response.json(body, { status: error.statusCode });
  }

  const body: ApiErrorBody = {
    error: {
      message: "Internal server error",
    },
  };

  return Response.json(body, { status: 500 });
}
