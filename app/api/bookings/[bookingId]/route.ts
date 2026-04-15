import { getBookingById } from "@/lib/server/bookings/service";
import { handleRouteError, ok } from "@/lib/server/api-response";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/bookings/[bookingId]">
): Promise<Response> {
  try {
    const { bookingId } = await ctx.params;
    const booking = await getBookingById(bookingId);

    return ok({
      data: booking,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
