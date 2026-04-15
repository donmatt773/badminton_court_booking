import BookingStatus from "@/app/customer/components/booking-status";

type SearchParams = Record<string, string | string[] | undefined>;

function getFirst(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function CustomerStatusPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;

  return (
    <BookingStatus
      email={getFirst(resolved.email).trim().toLowerCase()}
      bookingDate={getFirst(resolved.date).trim()}
      bookingId={getFirst(resolved.bookingId).trim()}
    />
  );
}
