import prisma from "../db.server";
import { sendNotification } from "../email.server";
import { DEFAULT_TEMPLATES } from "../notification-defaults";

// Called once per day by an external cron service.
// Requires header: x-cron-secret: <CRON_SECRET env var>

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today    = dateOnly(new Date());
  const tomorrow = addDays(today, 1);

  const configs = await prisma.notificationConfig.findMany();
  let sent = 0, skipped = 0;

  for (const config of configs) {
    const { shop }  = config;
    const savedTpls = config.templates ?? {};

    const bookings = await prisma.booking.findMany({
      where: {
        shop,
        status:        { in: ["confirmed"] },
        customerEmail: { not: null },
      },
    });

    for (const booking of bookings) {
      if (!booking.customerEmail) continue;
      const vars = buildVars(shop, booking);

      // Check-in Day — send on startDate
      if (booking.startDate === fmt(today)) {
        const r = await maybeSend(shop, booking, "checkinDay", vars);
        r.sent ? sent++ : skipped++;
      }

      // Check-out Reminder — send the day before endDate
      if (booking.endDate && booking.endDate === fmt(tomorrow)) {
        const r = await maybeSend(shop, booking, "checkoutReminder", vars);
        r.sent ? sent++ : skipped++;
      }

      // Booking Reminder — X days before check-in
      const reminderTpl = { ...DEFAULT_TEMPLATES.bookingReminder, ...(savedTpls.bookingReminder ?? {}) };
      if (reminderTpl.enabled && reminderTpl.timing && booking.startDate) {
        const dueDate = fmt(addDays(parseDate(booking.startDate), -reminderTpl.timing));
        if (dueDate === fmt(today)) {
          const r = await maybeSend(shop, booking, "bookingReminder", vars);
          r.sent ? sent++ : skipped++;
        }
      }

      // Review Request — X days after check-out
      const reviewTpl = { ...DEFAULT_TEMPLATES.reviewRequest, ...(savedTpls.reviewRequest ?? {}) };
      if (reviewTpl.enabled && reviewTpl.timing && booking.endDate) {
        const dueDate = fmt(addDays(parseDate(booking.endDate), reviewTpl.timing));
        if (dueDate === fmt(today)) {
          const r = await maybeSend(shop, booking, "reviewRequest", vars);
          r.sent ? sent++ : skipped++;
        }
      }
    }
  }

  return Response.json({ ok: true, sent, skipped, date: fmt(today) });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function maybeSend(shop, booking, type, vars) {
  const existing = await prisma.notificationLog.findUnique({
    where: { bookingId_type: { bookingId: booking.id, type } },
  });
  if (existing) return { skipped: true };

  await prisma.notificationLog.create({ data: { shop, bookingId: booking.id, type } });
  return sendNotification(shop, type, vars, { to: booking.customerEmail });
}

function buildVars(shop, booking) {
  const [firstName, ...rest] = (booking.customerName || "").split(" ");
  return {
    "date":               booking.startDate,
    "start":              booking.startDate,
    "end":                booking.endDate || booking.startDate,
    "product.name":       booking.productTitle,
    "product.url":        `https://${shop}/products/${slugify(booking.productTitle)}`,
    "order.name":         booking.orderNumber ? `#${booking.orderNumber}` : "",
    "order.note":         "",
    "customer.firstName": firstName || "",
    "customer.lastName":  rest.join(" ") || "",
  };
}

function slugify(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fmt(d) {
  return d.toISOString().split("T")[0];
}

function dateOnly(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function parseDate(s) {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}
