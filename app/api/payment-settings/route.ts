import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { PaymentSettingsModel } from "@/lib/server/graphql/models/PaymentSettings";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

export async function GET(): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    const settings = await PaymentSettingsModel.findOne({ key: "default" });

    return Response.json({
      data: settings
        ? {
            provider: settings.provider,
            accountName: settings.accountName,
            accountNumber: settings.accountNumber,
            instructions: settings.instructions,
            qrImage: settings.qrImage,
          }
        : {
            provider: "GCash",
            accountName: "",
            accountNumber: "",
            instructions: "",
            qrImage: null,
          },
    });
  } catch (error) {
    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch payment settings") } },
      { status: 500 }
    );
  }
}
