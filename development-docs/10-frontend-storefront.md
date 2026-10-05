# 10 — Frontend & Storefront
**Last Updated:** 2026-10-05

> This document covers everything customer-facing: the App Extension widget and the server-side proxy APIs that power it.

## Architecture Overview

```
Customer's Browser
  → Shopify Storefront (product page)
    → Theme App Extension injects widget JS
      → Widget calls App Proxy endpoints (/apps/rentfic/*)
        → Proxy routes authenticate + query DB
          → Return JSON to widget
```

---

## App Proxy Endpoints

All proxy routes use `authenticate.public.appProxy(request)` and are accessible from the storefront at `/apps/rentfic/...`.

### `GET /api/proxy/apartment/:productId`
**File:** `app/routes/api.proxy.apartment.$productId.jsx`

Returns the rental configuration for a specific Shopify product. The widget calls this on page load to check if the current product has a rental configuration.

**Response (if found):**
```json
{
  "found": true,
  "apartment": {
    "id": "...",
    "name": "...",
    "listingType": "property",
    "bookingType": "range",
    "pricePerNight": 150,
    "calendarStartDate": null,
    "calendarEndDate": null,
    "checkInTime": "14:00",
    "checkOutTime": "11:00",
    "minDays": 2,
    "maxDays": null,
    "maxAdults": 4,
    "maxChildren": 2,
    "maxInfants": 1,
    "minAdults": 1,
    "blockedDates": ["2026-12-25"],
    "weeklyAvailability": { "mon": {...}, ... },
    "additionalFees": [...],
    "conditionalDiscounts": [...],
    "weekendPricing": null,
    "seasonPricing": [...],
    "amenities": ["WiFi", "Pool"],
    "description": "...",
    "bufferDays": 1,
    "minLeadTime": 2
  },
  "shop": {
    "timezone": "Asia/Dhaka",
    "timeFormat": "12",
    "translate": "automatic",
    "redirectAfterCart": "automatic",
    "displayCalendar": "always_open",
    "blockedDates": ["2026-01-01"],
    "depositType": "percent",
    "depositValue": 20
  }
}
```

**Response (if not found or draft):**
```json
{ "found": false }
```

---

### `POST /api/proxy/booking`
**File:** `app/routes/api.proxy.booking.jsx`

Called by the widget when a customer submits the booking form. This endpoint:

1. Validates the booking data (dates, guest counts, quantity).
2. Re-calculates the total price server-side (mirrors widget calculation).
3. If a deposit is configured:
   - Gets or creates a dedicated "Deposit" Shopify product variant.
   - Sets the variant's price to the deposit amount.
4. Returns the variant GID for the widget to add to the cart.

**Pricing Calculation** (`calcTotal` function):
```
base = quantity × nights × pricePerNight
+ additional fees (flat or percent, per night or per booking)
- conditional discounts (based on minDays / minTotal / minQty)
= total
```

---

### `POST /api/proxy/price-reset`
**File:** `app/routes/api.proxy.price-reset.jsx`

Resets the deposit variant price to `$0.00` after a cart is abandoned or cleared. Prevents stale pricing from affecting future customers.

---

## Theme App Extension (Booking Widget)

**Location:** `extensions/` folder (Shopify Theme App Extension)

The widget is a JavaScript file injected into the Shopify storefront via the App Embed block. It:

1. Detects which product page it's on.
2. Calls `/apps/rentfic/api/proxy/apartment/:productId` to check if a rental config exists.
3. If found, renders the full booking widget UI (calendar, date picker, guest selector, price summary).
4. On "Add to Cart", calls `/apps/rentfic/api/proxy/booking` to finalize pricing, then adds the result to the Shopify cart.

### Widget Features
- **Date Picker**: Single date / date range / multi-date selection (based on `bookingType`).
- **Availability Calendar**: Blocks out existing bookings, blocked dates, and days outside weekly availability.
- **Guest Counter**: Adults, children, infants (shown for `listingType = property`).
- **Price Breakdown**: Shows base price, fees, discounts, deposit, and total in real time.
- **Language**: Translates based on `shop.translate` setting.
- **Timezone**: All date display respects `shop.timezone`.

### App Embed Configuration
The merchant must enable the Rentfic App Embed block in the Shopify Theme Editor under **Online Store → Themes → Customize → App Embeds**.

The Dashboard auto-detects whether the embed is enabled and shows a warning if not.

---

## iCal Export

- **Per Rental**: `GET /api/export/ical/:apartmentId` → downloads `.ics` for all bookings of that rental.
- **All Bookings**: `GET /api/export/bookings` → downloads all bookings as CSV.
