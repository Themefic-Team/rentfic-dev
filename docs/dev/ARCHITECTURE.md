# Rentfic — Development Architecture

> **Verified against**: `package.json`, `shopify.app.toml`, `app/shopify.server.js`, `app/routes/app.jsx`, `prisma/schema.prisma`, `vite.config.js`

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Application Entry Points](#application-entry-points)
5. [Authentication & Session Management](#authentication--session-management)
6. [Database Layer](#database-layer)
7. [Billing & Plans](#billing--plans)
8. [Route Architecture](#route-architecture)
9. [Theme Extension](#theme-extension)
10. [Email / Notification System](#email--notification-system)
11. [Webhook Architecture](#webhook-architecture)
12. [Public API Proxy](#public-api-proxy)
13. [Environment Variables](#environment-variables)
14. [Deployment](#deployment)

---

## Overview

Rentfic is a Shopify embedded app that turns any Shopify product into a rentable listing (apartment, room, cabin, etc.). It provides:

- A booking widget injected into the Shopify storefront via a **theme app extension**.
- An **embedded admin panel** for managing apartments, bookings, availability, notifications, and billing.
- A **transactional email engine** for automated guest and owner notifications.
- A **public REST-like proxy API** that the storefront widget calls for availability checks and booking creation.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React Router (Remix-style) | `^7.12.0` |
| Runtime | Node.js | `>=20.19 <22 \|\| >=22.12` |
| Database ORM | Prisma | `^6.16.3` |
| Database | PostgreSQL | via `DATABASE_URL` env |
| Session Storage | `@shopify/shopify-app-session-storage-prisma` | `^9.0.0` |
| Shopify Integration | `@shopify/shopify-app-react-router` | `^1.1.0` |
| Admin UI | `@shopify/polaris` | `^13.9.5` |
| App Bridge | `@shopify/app-bridge-react` | `^4.2.4` |
| Email | `nodemailer` | `^8.0.11` |
| Build tool | Vite | `^6.3.6` |
| Shopify API version | `October25` | (set in `shopify.server.js`) |

---

## Project Structure

```
rentfic-dev/
├── app/                          # Main application code
│   ├── components/               # Shared React components
│   │   ├── PlanCard.jsx          # Billing plan comparison card
│   │   └── TimezoneSelect.jsx    # Timezone dropdown selector
│   ├── routes/                   # All page and API routes (file-based routing)
│   ├── db.server.js              # Prisma client singleton
│   ├── email.server.js           # Nodemailer-based notification engine
│   ├── notification-defaults.js  # Default email template definitions
│   ├── plans.server.js           # Plan limits and billing config
│   ├── shopify.server.js         # Shopify app SDK initialization + billing config
│   ├── root.jsx                  # Root React Router layout
│   └── routes.js                 # Route manifest
├── extensions/
│   └── rentfic/                  # Shopify theme app extension
│       ├── assets/
│       │   ├── rentfic-booking.js    # Storefront booking widget (1278 lines, vanilla JS)
│       │   └── rentfic-booking.css   # Widget styles
│       ├── blocks/
│       │   └── app_embed.liquid  # App embed block (injected into theme body)
│       └── shopify.extension.toml
├── prisma/
│   ├── schema.prisma             # Database schema (6 models)
│   └── migrations/               # Migration history
├── docs/                         # All project documentation
├── shopify.app.toml              # Shopify CLI app config (webhooks, scopes, proxy)
├── vite.config.js                # Vite / React Router build config
└── package.json
```

---

## Application Entry Points

### Admin App (`app/routes/app.jsx`)
The root layout for all admin routes. On every load it:
1. Calls `authenticate.admin(request)` to validate the Shopify session.
2. Queries the Shopify Admin GraphQL API to sync the shop's `name`, `email`, `currency`, `timezone`, and `country` into the `Shop` table.
3. Fetches the active subscription's `currentPeriodEnd` to display a renewal date.
4. Exposes `apiKey`, `appPlan`, `apartmentCount`, and `apartmentLimit` to child routes.
5. Conditionally loads the **Crisp chat** widget for `business` plan merchants.

The navigation bar (`<s-app-nav>`) includes:
- Dashboard, Apartments Settings, Global Settings, Booking, Notifications, Subscription, Help
- Analytics (shown only when `appPlan === "business"`)

### Storefront Widget (`extensions/rentfic/blocks/app_embed.liquid`)
An **app embed block** (`"target": "body"`) injected on every theme page. It:
1. Sets `data-*` attributes read by the JS widget (shop domain, currency, money format, primary color, button text).
2. Detects if the current page is an apartment product via the `product.metafields.rentfic.is_apartment` metafield.
3. Hides native Shopify add-to-cart / payment / quantity UI on apartment product pages via CSS.
4. Loads `rentfic-booking.css` and `rentfic-booking.js` as deferred assets.

---

## Authentication & Session Management

- **Library**: `@shopify/shopify-app-react-router`
- **Session storage**: Prisma (`Session` table in PostgreSQL).
- **Offline tokens**: The app uses offline (non-online) access tokens. The `Session.isOnline` field is always `false` for the tokens used by server-side API calls.
- **Auth prefix**: `/auth` — handled by `app/routes/auth.$.jsx`.

```javascript
// app/shopify.server.js
const shopify = shopifyApp({
  apiVersion: ApiVersion.October25,
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  ...
});
```

All admin route loaders/actions call `authenticate.admin(request)` which validates the session and redirects to OAuth if needed. Public proxy routes call `authenticate.public.appProxy(request)`.

---

## Database Layer

**ORM**: Prisma with PostgreSQL. Client singleton is in `app/db.server.js`.

See [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) for full model documentation.

### Models summary

| Model | Purpose |
|---|---|
| `Session` | Shopify OAuth sessions (managed by Prisma session storage adapter) |
| `Shop` | One row per installed shop — plan, settings, metadata |
| `Apartment` | One row per rental listing, linked to a Shopify product |
| `Booking` | One booking record per reservation |
| `NotificationConfig` | Per-shop SMTP config and custom email templates |
| `NotificationLog` | Deduplication log — prevents sending the same scheduled email twice |

---

## Billing & Plans

**Source**: `app/plans.server.js` and `app/shopify.server.js`

### Plan tiers

| Plan key | Monthly price | Yearly price | Apartments | Analytics |
|---|---|---|---|---|
| `free` | $0 | — | 1 | No |
| `pro` | $19/mo | $182/yr | Unlimited | No |
| `business` | $49/mo | $470/yr | Unlimited | Yes |

All plans have a **7-day free trial**.

### How plan limits are enforced

`getPlanLimits(plan)` is called in loaders to check what the current merchant can access:

```javascript
// app/plans.server.js
export const PLAN_LIMITS = {
  free:     { apartments: 1,        analytics: false },
  pro:      { apartments: Infinity, analytics: false },
  business: { apartments: Infinity, analytics: true  },
};
```

- Creating a new apartment is blocked if `count >= limits.apartments` (`app/routes/app.apartments.$id.jsx`, loader).
- The analytics page redirects to `/app/subscribtion` if `!limits.analytics` (`app/routes/app.analytics.jsx`, loader).

### Plan lifecycle

1. Merchant selects a plan on `/app/subscribtion`.
2. Shopify billing API creates a subscription.
3. Shopify fires the `app_subscriptions/update` webhook.
4. `webhooks.app_subscriptions.update.jsx` updates `Shop.plan` via `planKeyFromName(name)`.

> [!NOTE]
> The `Shop.plan` field is **never written** by the admin app loader on page load — only by the billing webhook. This prevents race conditions if Shopify fires the webhook during an active session.

---

## Route Architecture

All routes are under `app/routes/` and follow React Router v7 file-based conventions.

### Admin routes (require `authenticate.admin`)

| File | URL | Description |
|---|---|---|
| `app.jsx` | `/app` | Root layout — syncs shop, wraps all admin pages |
| `app._index.jsx` | `/app` | Dashboard — KPIs, recent bookings, embed status check |
| `app.apartments.jsx` | `/app/apartments` | Apartments layout shell |
| `app.apartments._index.jsx` | `/app/apartments` | Apartments list — create, delete, duplicate, bulk actions |
| `app.apartments.$id.jsx` | `/app/apartments/:id` | Apartment detail & settings editor |
| `app.booking.jsx` | `/app/booking` | Bookings layout shell |
| `app.booking._index.jsx` | `/app/booking` | Bookings list — filter, search, CSV export, draft orders |
| `app.booking.calendar.jsx` | `/app/booking/calendar` | Visual monthly calendar view of all bookings |
| `app.booking.new.jsx` | `/app/booking/new` | Manual booking creation form |
| `app.booking.$id.jsx` | `/app/booking/:id` | Booking detail & management |
| `app.settings.jsx` | `/app/settings` | Global shop settings |
| `app.notifications.jsx` | `/app/notifications` | Email template editor & SMTP config |
| `app.analytics.jsx` | `/app/analytics` | Revenue & booking analytics (Business plan only) |
| `app.subscribtion.jsx` | `/app/subscribtion` | Billing plan selection |
| `app.help.jsx` | `/app/help` | In-app help & FAQ |

### Webhook routes

| File | URL | Shopify topic |
|---|---|---|
| `webhooks.app.uninstalled.jsx` | `/webhooks/app/uninstalled` | `app/uninstalled` |
| `webhooks.app.scopes_update.jsx` | `/webhooks/app/scopes_update` | `app/scopes_update` |
| `webhooks.app_subscriptions.update.jsx` | `/webhooks/app_subscriptions/update` | `app_subscriptions/update` |
| `webhooks.orders.create.jsx` | `/webhooks/orders/create` | `orders/create` *(registered dynamically)* |

### Public / proxy API routes

| File | URL | Auth |
|---|---|---|
| `api.proxy.apartment.$productId.jsx` | `/api/proxy/apartment/:productId` | `authenticate.public.appProxy` |
| `api.proxy.booking.jsx` | `/api/proxy/booking` | `authenticate.public.appProxy` |
| `api.proxy.price-reset.jsx` | `/api/proxy/price-reset` | `authenticate.public.appProxy` |
| `api.export.bookings.jsx` | `/api/export/bookings` | `authenticate.admin` |
| `api.export.ical.$apartmentId.jsx` | `/api/export/ical/:apartmentId` | `authenticate.admin` |
| `api.reminders.jsx` | `/api/reminders` | `x-cron-secret` header |

---

## Theme Extension

**Extension name**: `rentfic` (`extensions/rentfic/`)

### App Embed Block (`blocks/app_embed.liquid`)

- **Target**: `body` (injected on all pages)
- **Schema settings** (configurable in Shopify theme editor):
  - `enabled` (checkbox) — Enable/disable the widget
  - `primary_color` (color) — Widget accent color, default `#008060`
  - `button_text` (text) — Book button label, default `Book Now`

The block checks `product.metafields.rentfic.is_apartment == 'true'` to decide whether to show the booking widget on a product page. When true, it hides the native Shopify add-to-cart, quantity, and payment buttons via CSS injection.

### Booking Widget (`assets/rentfic-booking.js`)

A self-contained, vanilla JS IIFE (1278 lines). It:
- Reads configuration from the `#rentfic-app-embed` `data-*` attributes.
- Fetches apartment data from `/apps/rentfic/apartment/:productId` (the app proxy).
- Renders a calendar, guest picker, price breakdown, and "Reserve Now" button directly in the product page DOM.
- Sends a `POST` to `/apps/rentfic/booking` to create the booking record and update the Shopify product variant price.
- Fires the `rentfic:ready` custom DOM event after initialization.

**Localization**: The widget includes built-in i18n dictionaries for `en`, `fr`, `de`, `es`, and `ar` (right-to-left aware).

---

## Email / Notification System

**Source**: `app/email.server.js`, `app/notification-defaults.js`

### Transport resolution priority

1. Merchant's own SMTP (if `emailProvider === "smtp"` and `smtpHost` is set in `NotificationConfig`).
2. App-level SMTP from environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ENCRYPTION`).
3. Ethereal test inbox (development fallback — not for production).

### Template variables

All email templates support the following `{{placeholder}}` variables:

| Variable | Description |
|---|---|
| `{{date}}` | Booking start date |
| `{{start}}` | Check-in date/time |
| `{{end}}` | Check-out date/time |
| `{{product.name}}` | Apartment/listing name |
| `{{product.url}}` | Storefront product URL |
| `{{order.name}}` | Shopify order number (e.g. `#1001`) |
| `{{order.note}}` | Order note |
| `{{customer.firstName}}` | Guest first name |
| `{{customer.lastName}}` | Guest last name |

### Notification types (8 templates)

| Key | Recipient | Trigger |
|---|---|---|
| `bookingConfirmation` | Guest | `orders/create` webhook confirms a booking |
| `ownerNewBooking` | Owner | Same as above — parallel send to shop email |
| `bookingReminder` | Guest | Daily cron: X days before `startDate` (configurable) |
| `checkinDay` | Guest | Daily cron: on `startDate` |
| `checkoutReminder` | Guest | Daily cron: day before `endDate` |
| `bookingCancelled` | Guest | Admin cancels a booking |
| `ownerBookingCancelled` | Owner | Admin cancels a booking |
| `reviewRequest` | Guest | Daily cron: X days after `endDate` (configurable) |

### Deduplication (`NotificationLog`)

The `NotificationLog` table has a unique constraint on `(bookingId, type)`. Scheduled sends (`api.reminders.jsx`) check for an existing log record before sending, preventing duplicate emails if the cron runs multiple times per day.

---

## Webhook Architecture

All webhooks are registered in `shopify.app.toml` and handled in `app/routes/webhooks.*.jsx`.

### `app/uninstalled` → `webhooks.app.uninstalled.jsx`
Deletes all `Session` records for the shop. Does **not** delete `Shop`, `Apartment`, or `Booking` data (data persists for reinstall).

### `app/scopes_update` → `webhooks.app.scopes_update.jsx`
Handled by the Shopify app SDK for scope change acknowledgement.

### `app_subscriptions/update` → `webhooks.app_subscriptions.update.jsx`
Updates `Shop.plan` based on the subscription `name` and `status`:
- `status === "ACTIVE"` → maps name to plan key via `planKeyFromName()`
- Any other status → sets plan to `"free"`

### `orders/create` → `webhooks.orders.create.jsx`
This is the core booking confirmation webhook. When a Shopify order is created:
1. Finds line items with a `_booking_id` property (set by the booking widget at cart time).
2. Updates the matching `Booking` record: sets `orderId`, `orderNumber`, `customerName`, `customerEmail`, and `status = "confirmed"`.
3. Sends `bookingConfirmation` email to the guest.
4. Sends `ownerNewBooking` email to the shop owner.

> [!IMPORTANT]
> The `orders/create` webhook subscription is registered dynamically, not in `shopify.app.toml`. It is registered by calling `registerWebhooks` in the admin app layout loader flow via the Shopify SDK.

---

## Public API Proxy

The app proxy is configured in `shopify.app.toml`:

```toml
[app_proxy]
url    = "https://rentfic-dev.onrender.com/api/proxy"
subpath = "rentfic"
prefix  = "apps"
```

Storefront requests to `https://{shop}/apps/rentfic/*` are forwarded to `https://rentfic-dev.onrender.com/api/proxy/*`. Shopify appends a `signature` query parameter for verification, which the SDK validates via `authenticate.public.appProxy(request)`.

### `GET /apps/rentfic/apartment/:productId`
Returns all public apartment configuration needed by the booking widget:
- `found`, `apartment` object (booking type, pricing, availability, constraints, fees, discounts), `shopSettings` (timezone, display preferences).

### `POST /apps/rentfic/booking`
Creates a booking from the storefront widget:
1. Validates availability (conflict check or stock check if `quantityEnabled`).
2. Calculates the final total: `base + additionalFees - conditionalDiscounts`.
3. Calculates the deposit amount if deposits are enabled.
4. Creates a `Booking` record with `status: "pending"`.
5. Updates the Shopify product variant price to the calculated total (so the customer sees the correct price at checkout).
6. If a deposit is configured, gets or creates a shared "Deposit" product variant and sets its price to the deposit amount.
7. Returns `bookingId`, `finalTotal`, `isDeposit`, `depositVariantId`.

> [!WARNING]
> The variant price mutation is executed using a direct `fetch` to the Shopify Admin REST/GraphQL API with the shop's offline access token, retrieved from the `Session` table. This approach bypasses the SDK and is inherently tied to the session not being expired.

### `POST /apps/rentfic/price-reset`
Resets the product variant price back to `pricePerNight` after cart interactions. Used by the widget when the user closes/cancels the booking flow.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_API_KEY` | Yes | App API key from Partner Dashboard |
| `SHOPIFY_API_SECRET` | Yes | App API secret |
| `SHOPIFY_APP_URL` | Yes | Public HTTPS URL of the deployed app |
| `SCOPES` | Yes | Comma-separated OAuth scopes |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CRON_SECRET` | Yes | Shared secret for `POST /api/reminders` |
| `SMTP_HOST` | No | App-level SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_ENCRYPTION` | No | `tls` or `ssl` (default: `tls`) |
| `SMTP_FROM_NAME` | No | Sender display name |
| `SMTP_FROM_EMAIL` | No | Sender email address |
| `SHOP_CUSTOM_DOMAIN` | No | Custom shop domain override |

---

## Deployment

The app is deployed to **Render** (`https://rentfic-dev.onrender.com`).

### Build & start commands

```bash
# Setup (run on deploy)
npm run setup         # prisma generate && prisma migrate deploy

# Start (production)
npm run start         # react-router-serve ./build/server/index.js

# Docker
npm run docker-start  # npm run setup && npm run start
```

### Development

```bash
npm run dev           # shopify app dev (starts tunnel + local server)
```

A `Dockerfile` is included for containerized deployments.
