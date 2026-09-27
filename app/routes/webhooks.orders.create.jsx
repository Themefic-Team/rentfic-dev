import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendNotification } from "../email.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);
  const order = payload;

  const customer      = order.customer || {};
  const customerName  = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null;
  const customerEmail = order.email || customer.email || null;

  // Find line items that carry a rentfic booking id
  const bookingItems = (order.line_items || []).filter((item) =>
    (item.properties || []).some((p) => p.name === "_booking_id")
  );

  if (!bookingItems.length) return new Response(null, { status: 200 });

  // Load shop record for owner email
  const shopRecord = await prisma.shop.findUnique({ where: { shop } });

  await Promise.all(
    bookingItems.map(async (item) => {
      const props     = Object.fromEntries((item.properties || []).map((p) => [p.name, p.value]));
      const bookingId = props["_booking_id"];
      if (!bookingId) return;

      let booking;
      try {
        // Update the pending booking created by the widget to confirmed
        booking = await prisma.booking.update({
          where: { id: bookingId },
          data: {
            orderId:      String(order.id),
            orderNumber:  String(order.order_number || ""),
            customerName,
            customerEmail,
            status: "confirmed",
          },
        });
      } catch {
        // Booking may have been deleted or the id is invalid - skip silently
        return;
      }

      const vars = buildVars(shop, booking, order);

      // Guest: booking confirmation
      if (customerEmail) {
        await sendNotification(shop, "bookingConfirmation", vars, { to: customerEmail });
      }

      // Owner: new booking alert
      if (shopRecord?.email) {
        await sendNotification(shop, "ownerNewBooking", vars, { to: shopRecord.email });
      }
    })
  );

  return new Response(null, { status: 200 });
};

function buildVars(shop, booking, order) {
  const customer = order.customer || {};
  return {
    "date":               booking.startDate,
    "start":              booking.startDate,
    "end":                booking.endDate || booking.startDate,
    "product.name":       booking.productTitle,
    "product.url":        `https://${shop}/products/${slugify(booking.productTitle)}`,
    "order.name":         `#${order.order_number || ""}`,
    "order.note":         order.note || "",
    "customer.firstName": customer.first_name || booking.customerName?.split(" ")[0] || "",
    "customer.lastName":  customer.last_name  || booking.customerName?.split(" ").slice(1).join(" ") || "",
  };
}

function slugify(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
