import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  // Verifies the Shopify HMAC signature from the App Proxy
  const { session } = await authenticate.public.appProxy(request);

  // Storefront sends numeric product ID; our DB stores the GID
  const productGid = `gid://shopify/Product/${params.productId}`;

  const [apartment, shop] = await Promise.all([
    prisma.apartment.findFirst({
      where: { shop: session.shop, productId: productGid },
    }),
    prisma.shop.findUnique({
      where: { shop: session.shop },
      select: { settings: true },
    }),
  ]);

  if (!apartment) {
    return Response.json({ found: false });
  }

  const s = apartment.settings ?? {};
  const ss = shop?.settings ?? {};

  // Only expose what the storefront widget needs — never expose internal IDs or full settings
  return Response.json({
    found: true,
    apartment: {
      id: apartment.id,
      bookingType: s.bookingType ?? "single",
      pricePerNight: apartment.pricePerNight ?? 0,
      calendarStartDate: s.calendarStartDate ?? null,
      calendarEndDate: s.calendarEndDate ?? null,
      minNights: s.minNights ?? 1,
      maxNights: s.maxNights ?? null,
      blockedDates: s.blockedDates ?? [],
      weeklyAvailability: s.weeklyAvailability ?? null,
      depositEnabled: s.depositEnabled ?? false,
      depositType: s.depositType ?? "percent",
      depositAmount: s.depositAmount ?? null,
      payNowEnabled: s.payNowEnabled ?? false,
      payNowPercent: s.payNowPercent ?? 100,
    },
    shopSettings: {
      timezone: ss.timezone ?? "UTC",
      timeFormat: ss.timeFormat ?? "12",
      displayCalendar: ss.displayCalendar ?? "always_open",
      startCalendar: ss.startCalendar ?? "current_date",
      redirectAfterCart: ss.redirectAfterCart ?? "automatic",
      fromPrice: ss.fromPrice ?? "automatic",
      blockedDates: ss.blockedDates ?? [],
      depositType: ss.depositType ?? "percent",
      depositValue: ss.depositValue ?? null,
    },
  });
};
