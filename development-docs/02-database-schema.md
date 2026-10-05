# 02 — Database Schema
**Last Updated:** 2026-10-05

> Source: `prisma/schema.prisma` | DB: PostgreSQL

## Models

### `Shop`
Stores one record per installed shop. Synced on every admin page load.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `shop` | String | Shopify domain, unique (e.g. `store.myshopify.com`) |
| `name` | String? | Shop display name |
| `email` | String? | Shop owner email |
| `plan` | String? | `"free"` / `"pro"` / `"business"` |
| `currency` | String? | ISO currency code |
| `timezone` | String? | IANA timezone string |
| `country` | String? | ISO country code |
| `settings` | Json? | Global Settings blob (see [06-global-settings.md](./06-global-settings.md)) |
| `installedAt` | DateTime | Auto-set on create |
| `updatedAt` | DateTime | Auto-updated |

---

### `Apartment`
One record per Rental Booking (called "apartment" internally).

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `shop` | String | Shopify domain (indexed) |
| `productId` | String | Shopify product GID (`gid://shopify/Product/...`) |
| `productTitle` | String | Synced from Shopify |
| `name` | String | Display name set by merchant |
| `status` | String | `"active"` / `"draft"` |
| `pricePerNight` | Float? | Base price (per night or per day) |
| `settings` | Json? | All other rental config (see [05-rentals.md](./05-rentals.md)) |
| `createdAt` | DateTime | Auto-set |
| `updatedAt` | DateTime | Auto-updated |

Indexes: `shop`

---

### `Booking`
One record per customer booking.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `shop` | String | Shopify domain (indexed) |
| `apartmentId` | String | FK → `Apartment.id` (indexed) |
| `productId` | String | Shopify product GID |
| `productTitle` | String | Snapshot at booking time |
| `orderId` | String? | Shopify Order ID (indexed) |
| `orderNumber` | String? | Human-readable order number |
| `customerName` | String? | Customer full name |
| `customerEmail` | String? | Customer email |
| `startDate` | String | `YYYY-MM-DD` |
| `endDate` | String? | `YYYY-MM-DD` |
| `nights` | Int? | Duration in nights/days |
| `totalPrice` | Float? | Full calculated price |
| `depositAmount` | Float? | Deposit collected at checkout |
| `draftOrderId` | String? | Shopify Draft Order GID (balance invoice) |
| `draftOrderUrl` | String? | URL to send balance invoice |
| `balanceStatus` | String? | `"pending"` / `"invoiced"` / `"paid"` |
| `status` | String | `"pending"` / `"confirmed"` / `"cancelled"` |
| `lineItemProperties` | Json? | Raw Shopify line item properties |
| `notes` | String? | Merchant or customer notes |

---

### `NotificationConfig`
One record per shop storing email delivery config and all template data.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `shop` | String | Unique per shop |
| `emailProvider` | String | `"default"` / `"smtp"` |
| `smtpHost` | String? | SMTP server hostname |
| `smtpPort` | Int? | Port (usually 587 or 465) |
| `smtpUser` | String? | SMTP login username |
| `smtpPass` | String? | SMTP password (stored plain, encrypt in prod!) |
| `smtpFromName` | String? | Sender display name |
| `smtpFromEmail` | String? | Sender email address |
| `smtpEncryption` | String? | `"tls"` / `"ssl"` |
| `templates` | Json? | Map of template key → template object (see [08-notifications.md](./08-notifications.md)) |

---

### `NotificationLog`
Tracks which notification types have already been sent for each booking (prevents duplicates).

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `shop` | String | Indexed |
| `bookingId` | String | Reference to booking |
| `type` | String | Template key (e.g. `bookingConfirmation`) |
| `sentAt` | DateTime | When sent |

Unique constraint: `(bookingId, type)` — each notification type fires once per booking.

---

### `Session`
Managed by `@shopify/shopify-app-session-storage-prisma`. Do not modify manually.
