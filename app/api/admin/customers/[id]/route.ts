import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { CustomerModel } from "@/lib/server/graphql/models/Customer";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  contactNumber: z.string().min(3).optional(),
  email: z
    .string()
    .email()
    .optional()
    .refine((value) => !value || value.toLowerCase().endsWith("@gmail.com"), {
      message: "Email must be a @gmail.com address",
    }),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const { id } = await context.params;
    const customer = await CustomerModel.findById(id);
    if (!customer) {
      return Response.json({ error: { message: "Customer not found" } }, { status: 404 });
    }

    return Response.json({ data: customer });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch customer") } },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());

    const customer = await CustomerModel.findByIdAndUpdate(id, body, { new: true });
    if (!customer) {
      return Response.json({ error: { message: "Customer not found" } }, { status: 404 });
    }

    return Response.json({ data: customer });
  } catch (error) {
    return Response.json({ error: { message: getFriendlyErrorMessage(error, "Update failed") } }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const { id } = await context.params;
    const deleted = await CustomerModel.findByIdAndDelete(id);
    if (!deleted) {
      return Response.json({ error: { message: "Customer not found" } }, { status: 404 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to delete customer") } },
      { status: 500 }
    );
  }
}
