import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);

  const whereClause = {
    shop: session.shop,
    status: { in: ["confirmed", "completed"] },
  };

  if (params.apartmentId !== "all") {
    whereClause.apartmentId = params.apartmentId;
  }

  const bookings = await prisma.booking.findMany({
    where: whereClause,
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rentfic//Rentfic Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  bookings.forEach(b => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${b.id}@rentfic`);
    lines.push(`DTSTART;VALUE=DATE:${b.startDate.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${(b.endDate ?? b.startDate).replace(/-/g, "")}`);
    lines.push(`SUMMARY:${b.customerName ?? "Booking"} - ${b.productTitle}`);
    lines.push(`STATUS:CONFIRMED`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="rentfic-bookings.ics"`,
    },
  });
};
