# Rentfic — API Reference

> **Verified against**: `app/routes/api.proxy.*.jsx`, `app/routes/api.export.*.jsx`, `app/routes/api.reminders.jsx`

---

## Table of Contents

1. [App Proxy API (Public — Storefront)](#app-proxy-api-public--storefront)
   - [GET /apps/rentfic/apartment/:productId](#get-appsrentficapartmentproductid)
   - [POST /apps/rentfic/booking](#post-appsrentficbooking)
   - [POST /apps/rentfic/price-reset](#post-appsrentficprice-reset)
2. [Admin Export APIs (Authenticated)](#admin-export-apis-authenticated)
   - [GET /api/export/bookings](#get-apiexportbookings)
   - [GET /api/export/ical/:apartmentId](#get-apiexporticalpartmentid)
3. [Cron API](#cron-api)
   - [POST /api/reminders](#post-apireminders)

---

## App Proxy API (Public — Storefront)

These endpoints are called by the `rentfic-booking.js` widget running in the customer's browser. They are accessed via the Shopify App Proxy, so the storefront URL is:

```
https://{shop_domain}/apps/rentfic/{path}
```

Shopify appends a signed `signature` query parameter to each proxied request. The SDK validates this in `authenticate.public.appProxy(request)`.

---

### `GET /apps/rentfic/apartment/:productId`

**File**: `app/routes/api.proxy.apartment.$productId.jsx`
**Auth**: App proxy signature (validated by SDK)

Returns all public configuration for a single apartment, keyed by Shopify numeric product ID.

#### URL parameters

| Parameter | Description |
|---|---|
| `productId` | Shopify numeric product ID (not GID) |

#### Response: 200 OK (apartment found)

```json
{
  "found": true,
  "apartment": {
    "id": "clx1...",
    "name": "Ocean View Suite",
    "description": "Beautiful apartment...",
    "bookingType": "nightly",
    "pricePerNight": 120.00,
    "calendarStartDate": "2025-01-01",
    "calendarEndDate": "2026-12-31",
    "checkInTime": "15:00",
    "checkOutTime": "11:00",
    "minDays": 2,
    "maxDays": 14,
    "maxAdults": 4,
    "maxChildren": 2,
    "maxInfants": 1,
    "maxGuests": 6,
    "blockedDates": ["2025-08-01"],
    "weeklyAvailability": {
      "mon": { "enabled": true, "open": "00:00", "close": "23:59" }
    },
    "bedrooms": 2,
    "bathrooms": 1,
    "address": "123 Ocean Dr",
    "city": "Miami",
    "country": "US",
    "amenities": ["WiFi", "Pool"],
    "additionalFees": [
      { "name": "Cleaning Fee", "type": "flat", "amount": 50, "applyPer": "booking" }
    ],
    "conditionalDiscounts": [
      { "condition": "minDays", "conditionValue": 7, "discountType": "percent", "discountValue": 10 }
    ],
    "discountedDates": [],
    "quantityEnabled": false,
    "stockEnabled": false,
    "stockQuantity": null,
    "depositEnabled": true,
    "depositType": "percent",
    "depositAmount": 30
  },
  "shopSettings": {
    "timezone": "UTC",
    "timeFormat": "12",
    "displayCalendar": "always_open",
    "startCalendar": "current_date",
    "redirectAfterCart": "automatic",
    "fromPrice": "automatic",
    "quantityPosition": "product_and_calendar",
    "blockedDates": [],
    "depositType": "percent",
    "depositValue": null,
    "translate": "automatic"
  }
}
```

#### Response: 200 OK (not found or inactive)

```json
{ "found": false }
```

> [!NOTE]
> Always returns HTTP 200 even when `found: false`. This prevents the widget from displaying errors on non-apartment product pages.

---

### `POST /apps/rentfic/booking`

**File**: `app/routes/api.proxy.booking.jsx`
**Auth**: App proxy signature (validated by SDK)
**Content-Type**: `application/json`

Creates a new booking record and updates the Shopify product variant price to reflect the calculated total.

#### Request body

```json
{
  "apartmentId": "clx1...",
  "startDate": "2025-08-10",
  "endDate": "2025-08-15",
  "nights": 5,
  "bookingType": "nightly",
  "guests": {
    "adults": 2,
    "children": 1,
    "infants": 0
  },
  "quantity": 1,
  "bookingDates": ["2025-08-10", "2025-08-11"]
}
```

| Field | Required | Description |
|---|---|---|
| `apartmentId` | Yes | Rentfic apartment ID (cuid) |
| `startDate` | Yes | Check-in date `YYYY-MM-DD` |
| `endDate` | No | Check-out date `YYYY-MM-DD` |
| `nights` | No | Number of nights (computed if omitted) |
| `bookingType` | No | `"nightly"` / `"single"` / `"multi"` |
| `guests` | No | `{ adults, children, infants }` |
| `quantity` | No | Number of units (for stock-enabled listings) |
| `bookingDates` | No | Array of selected dates (for multi-date booking type) |

#### Pricing calculation (server-side)

The server recalculates the total to prevent client-side manipulation:

```
total = (quantity × nights × pricePerNight) + additionalFees - conditionalDiscounts
```

**Additional fees** can be:
- `flat` per booking: `quantity × feeAmount`
- `flat` per night: `quantity × nights × feeAmount`
- `percent` of base: `base × (feePercent / 100)`

**Conditional discounts** are applied when conditions are met:
- `minDays`: `nights >= conditionValue`
- `minTotal`: `base >= conditionValue`
- `minQty`: `totalGuests >= conditionValue`

#### Availability check

If `quantityEnabled` is true, counts overlapping `pending` or `confirmed` bookings and checks `stockQuantity - bookedQty >= requestedQuantity`.

If `quantityEnabled` is false, performs a simple conflict check: any overlapping `pending` or `confirmed` booking blocks the dates.

#### Response: 200 OK

```json
{
  "success": true,
  "bookingId": "clx2...",
  "finalTotal": 650.00,
  "isDeposit": true,
  "depositCharged": 195.00,
  "depositVariantId": "12345678",
  "depositVariantGid": "gid://shopify/ProductVariant/12345678",
  "resetPrice": 120.00
}
```

| Field | Description |
|---|---|
| `bookingId` | ID of the created `Booking` record |
| `finalTotal` | Full calculated booking total |
| `isDeposit` | `true` if only a deposit is charged at checkout |
| `depositCharged` | Deposit amount (null if full price charged) |
| `depositVariantId` | Numeric ID of the deposit product variant |
| `resetPrice` | `pricePerNight` — the widget resets the variant to this after checkout |

#### Error responses

| Status | Condition |
|---|---|
| `400` | `apartmentId` or `startDate` missing, or invalid JSON |
| `404` | Apartment not found or belongs to different shop |
| `405` | Method is not POST |
| `409` | Dates unavailable (conflict or insufficient stock) |

---

### `POST /apps/rentfic/price-reset`

**File**: `app/routes/api.proxy.price-reset.jsx`
**Auth**: App proxy signature (validated by SDK)

Resets the Shopify product variant price back to `pricePerNight` after the user abandons the booking flow. The booking widget calls this when the calendar is closed or the page unloads after a failed booking.

#### Request body

```json
{
  "apartmentId": "clx1...",
  "resetPrice": 120.00
}
```

#### Response: 200 OK

```json
{ "success": true }
```

---

## Admin Export APIs (Authenticated)

These endpoints require a valid Shopify admin session (`authenticate.admin`).

---

### `GET /api/export/bookings`

**File**: `app/routes/api.export.bookings.jsx`
**Auth**: `authenticate.admin` (Shopify session cookie)

Exports all bookings for the authenticated shop.

#### Query parameters

| Parameter | Values | Default | Description |
|---|---|---|---|
| `format` | `csv` / `json` | `csv` | Export format |

#### CSV format

Returns a UTF-8 CSV file with the following columns:

```
ID, Order, Guest, Email, Apartment, Check-in, Check-out, Nights, Total, Deposit, Status, Created
```

**Content-Disposition**: `attachment; filename="rentfic-bookings-YYYY-MM-DD.csv"`

#### JSON format

Returns the raw array of `Booking` objects from Prisma.

---

### `GET /api/export/ical/:apartmentId`

**File**: `app/routes/api.export.ical.$apartmentId.jsx`
**Auth**: `authenticate.admin`

Exports confirmed and completed bookings as an iCalendar (`.ics`) file compatible with Google Calendar, Apple Calendar, etc.

#### URL parameters

| Parameter | Description |
|---|---|
| `apartmentId` | Rentfic apartment cuid, or the string `"all"` to export all apartments |

#### Response

Returns an RFC 5545-compliant iCalendar file.

```
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename="rentfic-bookings.ics"
```

Each booking generates one `VEVENT`:
```
BEGIN:VEVENT
UID:{bookingId}@rentfic
DTSTART;VALUE=DATE:20250810
DTEND;VALUE=DATE:20250815
SUMMARY:{customerName} — {productTitle}
STATUS:CONFIRMED
END:VEVENT
```

Only `confirmed` and `completed` bookings are included. `pending` and `cancelled` bookings are excluded.

---

## Cron API

### `POST /api/reminders`

**File**: `app/routes/api.reminders.jsx`
**Auth**: `x-cron-secret` header (must match `CRON_SECRET` env var)

Processes all scheduled email notifications for all shops. Designed to be called once per day by an external cron service (e.g., Render cron jobs, GitHub Actions, cron-job.org).

#### Request

```http
POST /api/reminders
x-cron-secret: {CRON_SECRET}
```

No request body is required.

#### Notification logic (per booking, per shop)

| Notification type | Condition |
|---|---|
| `checkinDay` | `booking.startDate === today` |
| `checkoutReminder` | `booking.endDate === tomorrow` |
| `bookingReminder` | `today === startDate - template.timing days` |
| `reviewRequest` | `today === endDate + template.timing days` |

All sends are deduplicated via `NotificationLog`. If a `(bookingId, type)` record already exists, the send is skipped.

Only `confirmed` bookings with a `customerEmail` are processed.

#### Response: 200 OK

```json
{
  "ok": true,
  "sent": 12,
  "skipped": 3,
  "date": "2025-08-10"
}
```

#### Error responses

| Status | Condition |
|---|---|
| `401` | Missing or incorrect `x-cron-secret` header |
| `405` | Method is not POST |
