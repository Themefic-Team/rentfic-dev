import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "csv"; // "csv" or "json"

  const bookings = await prisma.booking.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  if (format === "csv") {
    const headers = ["ID","Order","Guest","Email","Apartment","Check-in","Check-out","Nights","Total","Deposit","Status","Created"];
    const rows = bookings.map(b => [
      b.id, b.orderNumber ?? "", b.customerName ?? "", b.customerEmail ?? "",
      b.productTitle, b.startDate, b.endDate ?? "", b.nights ?? "",
      b.totalPrice ?? "", b.depositAmount ?? "", b.status,
      new Date(b.createdAt).toISOString().split("T")[0],
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="rentfic-bookings-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  return Response.json(bookings);
};
