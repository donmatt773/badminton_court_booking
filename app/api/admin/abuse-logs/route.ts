import { ensureGraphQLRuntimeStarted } from "@/lib/server/graphql/runtime";
import { requireAdminSession } from "@/lib/server/admin-guard";
import { AbuseLogModel } from "@/lib/server/graphql/models/AbuseLog";
import { CustomerModel } from "@/lib/server/graphql/models/Customer";
import { getFriendlyErrorMessage } from "@/lib/server/friendly-error";

export async function GET(): Promise<Response> {
  try {
    await ensureGraphQLRuntimeStarted();
    await requireAdminSession();

    const logs = await AbuseLogModel.find({}).sort({ createdAt: -1 }).limit(300).lean();

    // For logs that have a contactNumber or email in metadata but no customerName,
    // look up the customer to backfill the name.
    const enriched = await Promise.all(
      logs.map(async (log) => {
        const meta = log.metadata as Record<string, unknown> | undefined | null;
        if (meta && !meta.customerName && (meta.contactNumber || meta.email)) {
          const query: Record<string, unknown>[] = [];
          if (meta.contactNumber) query.push({ contactNumber: meta.contactNumber });
          if (meta.email) query.push({ email: meta.email });
          const customer = await CustomerModel.findOne({ $or: query }).select("name email contactNumber").lean();
          if (customer) {
            return {
              ...log,
              metadata: {
                ...meta,
                customerName: customer.name,
                email: customer.email ?? meta.email,
                contactNumber: customer.contactNumber ?? meta.contactNumber,
              },
            };
          }
        }
        return log;
      })
    );

    return Response.json({ data: enriched });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: { message: "Unauthorized" } }, { status: 401 });
    }

    return Response.json(
      { error: { message: getFriendlyErrorMessage(error, "Failed to fetch abuse logs") } },
      { status: 500 }
    );
  }
}
