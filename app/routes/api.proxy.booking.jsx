import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const SHOPIFY_API_VERSION = "2025-10";

// Server-side total mirrors the widget calculation (quantity-aware)
function calcTotal(apartment, nights, guests = {}, quantity = 1) {
  const s = apartment.settings ?? {};
  const qty = Math.max(1, quantity);
  const base = qty * nights * (apartment.pricePerNight || 0);

  const fees = (s.additionalFees || []).reduce((sum, fee) => {
    if (!fee.amount) return sum;
    let amount;
    if (fee.type === "percent") {
      amount = base * (parseFloat(fee.amount) / 100);
    } else if (fee.applyPer === "night") {
      amount = qty * nights * parseFloat(fee.amount);
    } else {
      // flat per-booking: charged once per unit
      amount = qty * parseFloat(fee.amount);
    }
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const totalGuests = (guests.adults || 0) + (guests.children || 0) + (guests.infants || 0);
  let discount = 0;
  for (const rule of (s.conditionalDiscounts || [])) {
    const cv = parseFloat(rule.conditionValue) || 0;
    let met = false;
    if (rule.condition === "minDays" && nights >= cv) met = true;
    if (rule.condition === "minTotal"  && base >= cv)   met = true;
    if (rule.condition === "minQty"    && totalGuests >= cv) met = true;
    if (met) {
      let d = rule.discountType === "percent"
        ? base * (parseFloat(rule.discountValue) / 100)
        : parseFloat(rule.discountValue) || 0;
      if (rule.applyMode === "each") d *= nights;
      discount += isNaN(d) ? 0 : d;
    }
  }

  return Math.max(0, base + fees - discount);
}

// Update a single variant's price directly by its GID (no product lookup needed)
async function updateVariantPriceByGid(variantGid, price, endpoint, headers) {
  await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `mutation {
        productVariantUpdate(input: { id: "${variantGid}", price: "${parseFloat(price).toFixed(2)}" }) {
          productVariant { id price }
          userErrors { field message }
        }
      }`,
    }),
  });
}

// Moved Prisma-dependent functions inside the action function to prevent client build errors
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

  const { apartmentId, startDate, endDate, nights, bookingType, bookingDates, guests, quantity, guestName, guestEmail } = body;

  if (!apartmentId || !startDate) {
    return Response.json({ error: "apartmentId and startDate are required" }, { status: 400 });
  }

  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, shop: session.shop },
  });
  if (!apartment) {
    return Response.json({ error: "Apartment not found" }, { status: 404 });
  }

  const parsedNights   = Math.max(1, parseInt(nights) || 1);
  const parsedQuantity = Math.max(1, parseInt(quantity) || 1);
  const s = apartment.settings ?? {};

  // Stock check - count booked units overlapping these dates
  if (s.quantityEnabled && s.stockQuantity) {
    const overlapping = await prisma.booking.findMany({
      where: {
        apartmentId,
        status: { in: ["pending", "confirmed"] },
        OR: [
          { startDate: { lte: endDate || startDate }, endDate: { gte: startDate } },
        ],
      },
      select: { lineItemProperties: true },
    });
    const bookedQty = overlapping.reduce((sum, b) => sum + (b.lineItemProperties?.quantity || 1), 0);
    const available = s.stockQuantity - bookedQty;
    if (available < parsedQuantity) {
      return Response.json(
        { error: `Only ${Math.max(0, available)} unit${available !== 1 ? "s" : ""} available for these dates` },
        { status: 409 }
      );
    }
  } else {
    // Single-unit conflict check when quantity selector is off
    const conflicts = await prisma.booking.findMany({
      where: {
        apartmentId,
        status: { in: ["pending", "confirmed"] },
        OR: [
          { startDate: { lte: endDate || startDate }, endDate: { gte: startDate } },
        ],
      },
    });
    if (conflicts.length > 0) {
      return Response.json({ error: "Selected dates are no longer available" }, { status: 409 });
    }
  }

  const finalTotal = calcTotal(apartment, parsedNights, guests || {}, parsedQuantity);

  // Deposit calculation
  let depositCharged = null;
  const depositEnabled = s.depositEnabled ?? false;
  const depositType    = s.depositType ?? "percent";
  const depositAmt     = s.depositAmount ? parseFloat(s.depositAmount) : null;

  if (depositEnabled && depositAmt) {
    if (depositType === "percent") {
      depositCharged = Math.round(finalTotal * (depositAmt / 100) * 100) / 100;
    } else {
      depositCharged = Math.min(depositAmt, finalTotal);
    }
  }

  const booking = await prisma.booking.create({
    data: {
      shop:          session.shop,
      apartmentId,
      productId:     apartment.productId,
      productTitle:  apartment.productTitle,
      startDate,
      endDate:       endDate || startDate,
      nights:        parsedNights,
      totalPrice:    finalTotal,
      depositAmount: depositCharged,
      status:        "pending",
      customerName:  guestName || undefined,
      customerEmail: guestEmail || undefined,
      lineItemProperties: {
        bookingType,
        quantity: parsedQuantity,
        guests:   guests || {},
        ...(bookingDates ? { dates: bookingDates } : {}),
      },
    },
  });

  const productGid = apartment.productId.startsWith("gid://")
    ? apartment.productId
    : `gid://shopify/Product/${apartment.productId}`;

  const sess = await prisma.session.findFirst({
    where: { shop: session.shop, isOnline: false },
    orderBy: { expires: "desc" },
  });
  const endpoint = `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const headers  = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": sess?.accessToken,
  };

  async function updateVariantPrice(shop, productGid, price) {
    const sess = await prisma.session.findFirst({
      where: { shop, isOnline: false },
      orderBy: { expires: "desc" },
    });
    if (!sess?.accessToken) return;

    const endpoint = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": sess.accessToken,
    };

    const varRes = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `{ product(id: "${productGid}") { variants(first:1) { edges { node { id } } } } }`,
      }),
    });
    const varJson = await varRes.json();
    const variantId = varJson?.data?.product?.variants?.edges?.[0]?.node?.id;
    if (!variantId) return;

    await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `mutation BulkUpdatePrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id price }
            userErrors { field message }
          }
        }`,
        variables: {
          productId: productGid,
          variants: [{ id: variantId, price: price.toFixed(2) }],
        },
      }),
    });
  }

  // Main booking variant -> deposit if exists, otherwise full total
  const chargeAmount = depositCharged !== null ? depositCharged : finalTotal;
  await updateVariantPrice(session.shop, productGid, chargeAmount);

  let depositVariantGid = null;
  let depositVariantId  = null;

  return Response.json({
    success:          true,
    bookingId:        booking.id,
    finalTotal,
    isDeposit:        depositCharged !== null,
    depositCharged,
    depositVariantId,
    depositVariantGid,
    resetPrice:       apartment.pricePerNight || 0,
  });
};
