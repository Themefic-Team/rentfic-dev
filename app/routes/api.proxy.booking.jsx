import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.public.appProxy(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { apartmentId, startDate, endDate, nights, total, bookingType, bookingDates } = body;

  if (!apartmentId || !startDate) {
    return Response.json({ error: "apartmentId and startDate are required" }, { status: 400 });
  }

  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, shop: session.shop },
  });

  if (!apartment) {
    return Response.json({ error: "Apartment not found" }, { status: 404 });
  }

  // Check that the requested dates are not already booked
  const conflicts = await prisma.booking.findMany({
    where: {
      apartmentId,
      status: { in: ["pending", "confirmed"] },
      OR: [
        { startDate: { gte: startDate, lte: endDate || startDate } },
        { endDate:   { gte: startDate, lte: endDate || startDate } },
      ],
    },
  });

  if (conflicts.length > 0) {
    return Response.json({ error: "Selected dates are no longer available" }, { status: 409 });
  }

  const booking = await prisma.booking.create({
    data: {
      shop:         session.shop,
      apartmentId,
      productId:    apartment.productId,
      productTitle: apartment.productTitle,
      startDate,
      endDate:       endDate   || startDate,
      nights:        nights    ? parseInt(nights)   : null,
      totalPrice:    total     ? parseFloat(total)  : null,
      status:       "pending",
      lineItemProperties: bookingDates
        ? { bookingType, dates: bookingDates }
        : { bookingType },
    },
  });

  return Response.json({ success: true, bookingId: booking.id });
};
