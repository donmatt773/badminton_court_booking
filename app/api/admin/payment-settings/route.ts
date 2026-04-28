import { z } from "zod";
import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { PaymentSettingsModel } from "@/lib/server/graphql/models/PaymentSettings";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

const paymentSettingsSchema = z.object({
  provider: z.string().trim().min(2).max(40),
  accountName: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(5).max(40),
  instructions: z.string().trim().max(300).optional().default(""),
  qrImage: z.string().max(4_000_000).nullable().optional(),
});

async function getOrCreatePaymentSettings() {
  const existing = await PaymentSettingsModel.findOne({ key: "default" });
  if (existing) {
    return existing;
  }

  return PaymentSettingsModel.create({
    key: "default",
    provider: "GCash",
    accountName: "",
    accountNumber: "",
    instructions: "",
    qrImage: null,
  });
}

export async function GET(): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const settings = await getOrCreatePaymentSettings();
    return Response.json({ data: settings });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch payment settings") } },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    const session = await requireAdminSession();

    if (session.role !== "ADMIN") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }

    const body = paymentSettingsSchema.parse(await request.json());
    const settings = await PaymentSettingsModel.findOneAndUpdate(
      { key: "default" },
      {
        $set: {
          provider: body.provider,
          accountName: body.accountName,
          accountNumber: body.accountNumber,
          instructions: body.instructions ?? "",
          qrImage: body.qrImage ?? null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return Response.json({ data: settings });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to save payment settings") } },
      { status: 400 }
    );
  }
}
