import { created, handleRouteError, ok } from "@/lib/server/api-response";
import {
  createBooking,
  isValidBookingStatus,
  listBookings,
} from "@/lib/server/bookings/service";

export async function GET(request: Request): Promise<Response> {
  try {
    const searchParams = new URL(request.url).searchParams;
    const courtId = searchParams.get("courtId") ?? undefined;
    const statusParam = searchParams.get("status") ?? undefined;
    const status =
      statusParam && isValidBookingStatus(statusParam) ? statusParam : undefined;

    if (statusParam && !status) {
      return Response.json(
        {
          error: {
            message: `Invalid status. Use one of: pending, confirmed, cancelled`,
          },
        },
        { status: 400 }
      );
    }

    const bookings = await listBookings({
      courtId,
      status,
    });

    return ok({
      data: bookings,
      count: bookings.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as unknown;
    const booking = await createBooking(body);

    return created({
      data: booking,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
