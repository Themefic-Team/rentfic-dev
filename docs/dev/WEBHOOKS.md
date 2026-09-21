# Rentfic — Webhooks Reference

> **Verified against**: `shopify.app.toml`, `app/routes/webhooks.*.jsx`, `app/shopify.server.js`

---

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Webhook Handlers](#webhook-handlers)
   - [app/uninstalled](#appuninstalled)
   - [app/scopes_update](#appscopes_update)
   - [app_subscriptions/update](#app_subscriptionsupdate)
   - [orders/create](#orderscreate)
4. [Security](#security)
5. [Retry Behavior](#retry-behavior)

---

## Overview

The app subscribes to 4 Shopify webhook topics. Three are declared statically in `shopify.app.toml`. The `orders/create` webhook is registered dynamically by the Shopify SDK on app install.

Webhook API version: **`2026-07`** (set in `shopify.app.toml`).

All webhook handlers are in `app/routes/webhooks.*.jsx`. Each handler exports only an `action` function (POST only).

---

## Configuration

```toml
# shopify.app.toml

[webhooks]
api_version = "2026-07"

  [[webhooks.subscriptions]]
  uri    = "/webhooks/app/scopes_update"
  topics = ["app/scopes_update"]

  [[webhooks.subscriptions]]
  uri    = "/webhooks/app/uninstalled"
  topics = ["app/uninstalled"]

  [[webhooks.subscriptions]]
  uri    = "/webhooks/app_subscriptions/update"
  topics = ["app_subscriptions/update"]
```

---

## Webhook Handlers

### `app/uninstalled`

**File**: `app/routes/webhooks.app.uninstalled.jsx`
**URL**: `POST /webhooks/app/uninstalled`

**Behavior**:
- Verifies the webhook with `authenticate.webhook(request)`.
- If the shop's session still exists, deletes **all** `Session` records for that shop.
- Does **not** delete `Shop`, `Apartment`, `Booking`, or `NotificationConfig` data. All merchant data persists across reinstalls.

```javascript
export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  return new Response();
};
```

> [!NOTE]
> This webhook can fire multiple times or after the app is already uninstalled. The handler is idempotent — if the session no longer exists, `session` will be `null` and the delete is skipped.

---

### `app/scopes_update`

**File**: `app/routes/webhooks.app.scopes_update.jsx`
**URL**: `POST /webhooks/app/scopes_update`

**Behavior**:
- Handled by the Shopify app SDK internally for OAuth scope change acknowledgement.
- No custom business logic is applied.

---

### `app_subscriptions/update`

**File**: `app/routes/webhooks.app_subscriptions.update.jsx`
**URL**: `POST /webhooks/app_subscriptions/update`

**Behavior**:
1. Parses `payload.app_subscription` for `name` and `status`.
2. If `status === "ACTIVE"`, maps the subscription name to a plan key via `planKeyFromName()`:
   - Names containing `"business"` → `"business"`
   - Names containing `"pro"` → `"pro"`
   - Anything else → `"free"`
3. If status is not `"ACTIVE"` (e.g., `"CANCELLED"`, `"DECLINED"`, `"EXPIRED"`), sets plan to `"free"`.
4. Upserts the `Shop` record with the new plan key.

**Example payload**:
```json
{
  "app_subscription": {
    "admin_graphql_api_id": "gid://shopify/AppSubscription/1234",
    "name": "Pro",
    "status": "ACTIVE",
    "admin_graphql_api_shop_id": "gid://shopify/Shop/789"
  }
}
```

> [!IMPORTANT]
> This is the **only** place that writes `Shop.plan`. Page-load loaders explicitly avoid overwriting it to prevent race conditions.

---

### `orders/create`

**File**: `app/routes/webhooks.orders.create.jsx`
**URL**: `POST /webhooks/orders/create`

**Behavior**:
1. Parses the order payload for line items that carry a `_booking_id` property.
2. Skips processing if no booking line items are found.
3. For each matching line item:
   a. Updates the `Booking` record: sets `orderId`, `orderNumber`, `customerName`, `customerEmail`, `status = "confirmed"`.
   b. Sends a `bookingConfirmation` email to the guest (if customer email exists).
   c. Sends an `ownerNewBooking` email to the shop owner (if shop email exists in `Shop.email`).

**Booking identification**: The storefront widget passes `_booking_id` as a hidden line item property when adding the product to the cart. This property survives the checkout flow and arrives in the order payload.

**Email template variables** built from the order:
```javascript
{
  "date":               booking.startDate,
  "start":              booking.startDate,
  "end":                booking.endDate,
  "product.name":       booking.productTitle,
  "product.url":        `https://${shop}/products/${slugified_title}`,
  "order.name":         `#${order.order_number}`,
  "order.note":         order.note,
  "customer.firstName": customer.first_name,
  "customer.lastName":  customer.last_name,
}
```

> [!NOTE]
> The `orders/create` webhook is registered dynamically on app install by the Shopify SDK — it does **not** appear in `shopify.app.toml`. The SDK registers it automatically when the app is initialized.

---

## Security

All webhook handlers call `authenticate.webhook(request)` from the Shopify SDK, which:
1. Verifies the HMAC signature in the `X-Shopify-Hmac-Sha256` header.
2. Validates the request came from Shopify.
3. Returns `{ shop, payload, topic, session }`.

Requests with an invalid or missing HMAC are rejected by the SDK with a `401` before the handler code runs.

---

## Retry Behavior

Shopify retries failed webhook deliveries (non-`2xx` responses) up to 19 times over 48 hours with exponential backoff.

**Implications for this app**:
- `app/uninstalled`: Idempotent — safe to retry (session delete is a no-op if already deleted).
- `app_subscriptions/update`: Idempotent — upsert is a no-op on duplicate delivery.
- `orders/create`: Not fully idempotent — a duplicate delivery will attempt to `update` a booking that may already be `confirmed`. The Prisma `update` call will silently succeed (overwriting with the same data), and `sendNotification` may fire again. However, the email system has no deduplication for `orders/create` triggered emails (only cron-triggered emails are deduplicated via `NotificationLog`).
