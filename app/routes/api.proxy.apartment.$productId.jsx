import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.public.appProxy(request);
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

  return Response.json({
    found: true,
    apartment: {
      id: apartment.id,
      name: apartment.name,
      description: s.description ?? null,
      bookingType: s.bookingType ?? "single",
      pricePerNight: apartment.pricePerNight ?? 0,
      // dates & times
      calendarStartDate: s.calendarStartDate ?? null,
      calendarEndDate: s.calendarEndDate ?? null,
      checkInTime: s.checkInTime ?? null,
      checkOutTime: s.checkOutTime ?? null,
      // days/nights constraints
      minDays: s.minDays ?? 1,
      maxDays: s.maxDays ?? null,
      // guest limits
      maxAdults: s.maxAdults ?? null,
      maxChildren: s.maxChildren ?? null,
      maxInfants: s.maxInfants ?? null,
      maxGuests: s.maxGuests ?? null,
      // availability
      blockedDates: s.blockedDates ?? [],
      weeklyAvailability: s.weeklyAvailability ?? null,
      // property details
      bedrooms: s.bedrooms ?? null,
      bathrooms: s.bathrooms ?? null,
      address: s.address ?? null,
      city: s.city ?? null,
      country: s.country ?? null,
      amenities: s.amenities ?? [],
      // fees & discounts
      additionalFees: s.additionalFees ?? [],
      conditionalDiscounts: s.conditionalDiscounts ?? [],
      discountedDates: s.discountedDates ?? [],
      // quantity / stock
      quantityEnabled: s.quantityEnabled ?? false,
      stockEnabled: s.quantityEnabled ?? false,
      stockQuantity: s.stockQuantity ?? null,
      // payment
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
      quantityPosition: ss.quantityPosition ?? "product_and_calendar",
      blockedDates: ss.blockedDates ?? [],
      depositType: ss.depositType ?? "percent",
      depositValue: ss.depositValue ?? null,
    },
  });
};
