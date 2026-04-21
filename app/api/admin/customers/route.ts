import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { CustomerModel } from "@/lib/server/graphql/models/Customer";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

const customerSchema = z.object({
  name: z.string().min(2),
  contactNumber: z.string().min(3),
  email: z
    .string()
    .email()
    .refine((value) => value.toLowerCase().endsWith("@gmail.com"), {
      message: "Email must be a @gmail.com address",
    }),
});

export async function GET(): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const customers = await CustomerModel.find({}).sort({ createdAt: -1 }).limit(300);
    return Response.json({ data: customers });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch customers") } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const body = customerSchema.parse(await request.json());
    const customer = await CustomerModel.create({
      name: body.name,
      contactNumber: body.contactNumber,
      email: body.email.toLowerCase(),
    });

    return Response.json({ data: customer }, { status: 201 });
  } catch (error) {
    return Response.json({ error: { message: getFriendlyErrorMessage(error, "Create failed") } }, { status: 400 });
  }
}
