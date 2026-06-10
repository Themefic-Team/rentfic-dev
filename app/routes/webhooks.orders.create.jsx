import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  const order = payload;

  // Find line items that carry booking data
  const bookingItems = (order.line_items || []).filter((item) => {
    const props = item.properties || [];
    return props.some((p) => p.name === "_apartment_id");
  });

  if (!bookingItems.length) {
    return new Response(null, { status: 200 });
  }

  const customer = order.customer || {};
  const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null;
  const customerEmail = order.email || customer.email || null;

  await Promise.all(
    bookingItems.map(async (item) => {
      const props = Object.fromEntries(
        (item.properties || []).map((p) => [p.name, p.value])
      );

      const apartmentId = props["_apartment_id"];
      if (!apartmentId) return;

      // Look up the apartment to get productId + productTitle
      const apartment = await prisma.apartment.findFirst({
        where: { id: apartmentId, shop },
      });

      if (!apartment) return;

      await prisma.booking.create({
        data: {
          shop,
          apartmentId,
          productId:     apartment.productId,
          productTitle:  apartment.productTitle,
          orderId:       String(order.id),
          orderNumber:   String(order.order_number || ""),
          customerName,
          customerEmail,
          startDate:     props["_booking_start"] || "",
          endDate:       props["_booking_end"]   || null,
          nights:        props["_booking_nights"] ? parseInt(props["_booking_nights"]) : null,
          totalPrice:    props["_booking_total"]  ? parseFloat(props["_booking_total"]) : null,
          depositAmount: props["_booking_deposit"] ? parseFloat(props["_booking_deposit"]) : null,
          status:        "confirmed",
          lineItemProperties: item.properties,
        },
      });
    })
  );

  return new Response(null, { status: 200 });
};
