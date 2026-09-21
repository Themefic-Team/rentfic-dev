# Rentfic — Database Schema

> **Verified against**: `prisma/schema.prisma`

---

## Table of Contents

1. [Database Provider](#database-provider)
2. [Models](#models)
   - [Session](#session)
   - [Shop](#shop)
   - [Apartment](#apartment)
   - [Booking](#booking)
   - [NotificationConfig](#notificationconfig)
   - [NotificationLog](#notificationlog)
3. [Relationships & Indexes](#relationships--indexes)
4. [JSON Field Schemas](#json-field-schemas)

---

## Database Provider

- **Provider**: PostgreSQL
- **ORM**: Prisma `^6.16.3`
- **Connection**: `DATABASE_URL` environment variable
- **ID strategy**: All models use `cuid()` as the default ID (collision-resistant, URL-safe)

---

## Models

### Session

Managed automatically by `@shopify/shopify-app-session-storage-prisma`. Do not write to this table manually.

```prisma
model Session {
  id            String    @id
  shop          String
  state         String
  isOnline      Boolean   @default(false)
  scope         String?
  expires       DateTime?
  accessToken   String
  userId        BigInt?
  firstName     String?
  lastName      String?
  email         String?
  accountOwner  Boolean   @default(false)
  locale        String?
  collaborator  Boolean?  @default(false)
  emailVerified Boolean?  @default(false)
  refreshToken        String?
  refreshTokenExpires DateTime?
}
```

| Field | Notes |
|---|---|
| `id` | Shopify session ID string |
| `shop` | Shop domain (e.g. `mystore.myshopify.com`) |
| `isOnline` | Always `false` for the offline tokens used by server-side API calls |
| `accessToken` | Shopify Admin API offline access token — used by proxy routes for direct GraphQL/REST calls |
| `expires` | `null` for offline tokens (they do not expire unless revoked) |

---

### Shop

One record per installed shop. Created on first install; survives uninstall/reinstall.

```prisma
model Shop {
  id          String   @id @default(cuid())
  shop        String   @unique
  name        String?
  email       String?
  plan        String?              // "free" | "pro" | "business"
  currency    String?
  timezone    String?
  country     String?
  settings    Json?
  installedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

| Field | Notes |
|---|---|
| `shop` | Unique shop domain — the primary lookup key |
| `plan` | Set by `webhooks.app_subscriptions.update.jsx`. Defaults to `"free"` on first install. Never overwritten by page-load loaders. |
| `email` | Synced from Shopify Admin GraphQL on every admin page load (`app.jsx` loader). Used as the recipient for `ownerNewBooking` notifications. |
| `settings` | JSON blob — see [Shop settings schema](#shop-settings) below |

---

### Apartment

One record per rental listing. Each apartment is linked to exactly one Shopify product.

```prisma
model Apartment {
  id           String   @id @default(cuid())
  shop         String
  productId    String                          // Shopify product GID
  productTitle String
  name         String
  status       String   @default("active")    // "active" | "inactive"
  pricePerNight Float?
  settings     Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([shop])
}
```

| Field | Notes |
|---|---|
| `productId` | Shopify product GID (`gid://shopify/Product/...`). Used for variant price mutations. |
| `status` | `"active"` apartments appear in the storefront widget. `"inactive"` ones are hidden. |
| `pricePerNight` | Stored as a scalar for quick lookups. The storefront widget reads it from `settings` via the proxy API. |
| `settings` | Large JSON blob — see [Apartment settings schema](#apartment-settings) below |

---

### Booking

One record per reservation. Created with `status: "pending"` by the storefront widget, then confirmed via the `orders/create` webhook or manually via the admin.

```prisma
model Booking {
  id                  String   @id @default(cuid())
  shop                String
  apartmentId         String
  productId           String
  productTitle        String
  orderId             String?
  orderNumber         String?
  customerName        String?
  customerEmail       String?
  startDate           String                         // ISO date: "YYYY-MM-DD"
  endDate             String?                        // ISO date: "YYYY-MM-DD"
  nights              Int?
  totalPrice          Float?
  depositAmount       Float?
  draftOrderId        String?
  draftOrderUrl       String?
  balanceStatus       String?  // "pending" | "invoiced" | "paid"
  status              String   @default("pending")   // "pending" | "confirmed" | "cancelled"
  lineItemProperties  Json?
  notes               String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([shop])
  @@index([apartmentId])
  @@index([orderId])
}
```

| Field | Notes |
|---|---|
| `startDate` / `endDate` | Stored as ISO date strings (`"YYYY-MM-DD"`), not `DateTime`, to avoid timezone conversion issues. |
| `orderId` | Shopify order ID (numeric string). `null` until the `orders/create` webhook fires. |
| `status` | `pending` → created by widget. `confirmed` → order placed. `cancelled` → cancelled by admin. |
| `depositAmount` | Amount charged at booking time (if deposits enabled). `null` if full price was charged. |
| `draftOrderId` / `draftOrderUrl` | Set when a "Send Balance Invoice" draft order is created from the booking detail page. |
| `balanceStatus` | Tracks the remaining balance payment: `pending` → `invoiced` → `paid`. |
| `lineItemProperties` | JSON: `{ bookingType, quantity, guests: { adults, children, infants }, dates? }` |

---

### NotificationConfig

One record per shop. Stores SMTP configuration and per-type email template overrides.

```prisma
model NotificationConfig {
  id             String   @id @default(cuid())
  shop           String   @unique
  emailProvider  String   @default("default")   // "default" | "smtp"
  smtpHost       String?
  smtpPort       Int?
  smtpUser       String?
  smtpPass       String?
  smtpFromName   String?
  smtpFromEmail  String?
  smtpEncryption String?  @default("tls")        // "tls" | "ssl"
  templates      Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

| Field | Notes |
|---|---|
| `emailProvider` | `"default"` uses the app-level SMTP env vars. `"smtp"` uses the merchant's own SMTP credentials. |
| `templates` | JSON: `{ [templateKey]: { enabled, subject, body, timing? } }`. Only overridden templates are stored — defaults from `notification-defaults.js` are merged at send time. |

---

### NotificationLog

Deduplication table for scheduled (cron-triggered) notifications. Prevents sending the same reminder type more than once per booking.

```prisma
model NotificationLog {
  id        String   @id @default(cuid())
  shop      String
  bookingId String
  type      String
  sentAt    DateTime @default(now())

  @@unique([bookingId, type])
  @@index([shop])
}
```

The unique constraint `(bookingId, type)` is checked before every scheduled send in `api.reminders.jsx`. If a record exists, the send is skipped.

---

## Relationships & Indexes

Prisma does not define explicit foreign-key relations between models (all relationships are by `shop` domain string or `apartmentId` string). This is intentional for Shopify multi-tenancy: the `shop` field acts as the tenant discriminator on every query.

| Index | Model | Purpose |
|---|---|---|
| `@@index([shop])` | `Apartment`, `Booking`, `NotificationLog` | Fast per-shop lookups |
| `@@index([apartmentId])` | `Booking` | Filter bookings by apartment |
| `@@index([orderId])` | `Booking` | Look up bookings by Shopify order ID in `orders/create` webhook |
| `@@unique([bookingId, type])` | `NotificationLog` | Deduplication of scheduled emails |
| `@unique` on `shop` | `Shop`, `NotificationConfig` | Enforce one record per shop |

---

## JSON Field Schemas

### Shop settings

Stored in `Shop.settings`. Managed by `app/routes/app.settings.jsx`.

```json
{
  "timezone": "Asia/Dhaka",
  "timeFormat": "12",
  "translate": "automatic",
  "redirectAfterCart": "automatic",
  "displayCalendar": "always_open",
  "depositType": "percent",
  "depositValue": 20,
  "blockedDates": ["2025-12-25", "2025-12-26"],
  "depositVariantGid": "gid://shopify/ProductVariant/..."
}
```

| Key | Values | Description |
|---|---|---|
| `timezone` | IANA string | Display timezone for booking dates |
| `timeFormat` | `"12"` / `"24"` | Clock format for check-in/out times |
| `translate` | `"automatic"` / locale | Widget language |
| `redirectAfterCart` | `"automatic"` / `"checkout"` | Where to send user after adding to cart |
| `displayCalendar` | `"always_open"` / `"collapsed"` | Calendar initial state |
| `depositVariantGid` | GID string | Cached GID of the shared "Deposit" product variant |

---

### Apartment settings

Stored in `Apartment.settings`. Managed by `app/routes/app.apartments.$id.jsx`. Returned by the apartment proxy API.

```json
{
  "description": "Beautiful sea-view apartment...",
  "bookingType": "nightly",
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
    "mon": { "enabled": true, "open": "00:00", "close": "23:59" },
    "sun": { "enabled": false }
  },
  "bedrooms": 2,
  "bathrooms": 1,
  "address": "123 Ocean Drive",
  "city": "Miami",
  "country": "US",
  "amenities": ["WiFi", "Pool", "Air Conditioning"],
  "additionalFees": [
    { "name": "Cleaning Fee", "type": "flat", "amount": 50, "applyPer": "booking" }
  ],
  "conditionalDiscounts": [
    { "condition": "minDays", "conditionValue": 7, "discountType": "percent", "discountValue": 10 }
  ],
  "discountedDates": [],
  "quantityEnabled": false,
  "stockQuantity": null,
  "depositEnabled": true,
  "depositType": "percent",
  "depositAmount": 30
}
```

### NotificationConfig templates

Stored in `NotificationConfig.templates`. Only modified templates are stored — missing keys fall back to `notification-defaults.js`.

```json
{
  "bookingConfirmation": {
    "enabled": true,
    "subject": "{{order.name}} - Your booking of {{product.name}}",
    "body": "Hi {{customer.firstName}}, ...",
    "timing": null
  },
  "bookingReminder": {
    "enabled": true,
    "timing": 3
  }
}
```

### Booking lineItemProperties

Stored in `Booking.lineItemProperties`.

```json
{
  "bookingType": "nightly",
  "quantity": 1,
  "guests": {
    "adults": 2,
    "children": 1,
    "infants": 0
  },
  "dates": ["2025-08-10", "2025-08-12"]
}
```
