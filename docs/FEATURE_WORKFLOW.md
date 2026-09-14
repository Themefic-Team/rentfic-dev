# Rentfic — Step-by-Step Feature Working Flow

> This document describes **every feature's complete working flow** from user action to database result to storefront effect.
> Use alongside `PLUGIN_WORKFLOW.md` (architecture overview) and `QA_TESTING.md` (test scenarios).

---

## Table of Contents

1. [App Installation & First Run](#1-app-installation--first-run)
2. [Creating an Apartment](#2-creating-an-apartment)
3. [Editing an Apartment](#3-editing-an-apartment)
4. [Deleting an Apartment](#4-deleting-an-apartment)
5. [Storefront Widget — Boot & Display](#5-storefront-widget--boot--display)
6. [Customer Makes a Booking (Reserve Now)](#6-customer-makes-a-booking-reserve-now)
7. [Order Created → Booking Confirmed (Webhook)](#7-order-created--booking-confirmed-webhook)
8. [Booking Management — Admin View](#8-booking-management--admin-view)
9. [Booking Detail — Status Change & Balance Invoice](#9-booking-detail--status-change--balance-invoice)
10. [Email Notifications — Immediate Triggers](#10-email-notifications--immediate-triggers)
11. [Email Notifications — Time-Based (Cron)](#11-email-notifications--time-based-cron)
12. [Notification Settings — SMTP Setup](#12-notification-settings--smtp-setup)
13. [Global Settings](#13-global-settings)
14. [Subscription & Billing — Upgrade](#14-subscription--billing--upgrade)
15. [Subscription & Billing — Cancel](#15-subscription--billing--cancel)
16. [Dashboard Stats](#16-dashboard-stats)
17. [Plan Enforcement (Limits)](#17-plan-enforcement-limits)
18. [Price Reset After Cart](#18-price-reset-after-cart)
19. [App Uninstall](#19-app-uninstall)

---

## 1. App Installation & First Run

### Step-by-Step

1. Merchant installs Rentfic from the Shopify App Store.
2. Shopify redirects merchant to the app's OAuth URL.
3. App creates a **Session** record in the database via `@shopify/shopify-app-react-router`.
4. On the first authenticated page load (`app.jsx` loader):
   - Calls `authenticate.admin(request)` → validates session.
   - Runs a GraphQL query for `shop.name`, `shop.email`, `shop.currencyCode`, `shop.ianaTimezone`, `billingAddress.countryCodeV2`, and `currentAppInstallation.activeSubscriptions`.
   - Calls `prisma.shop.upsert`:
     - **If new shop** → creates record with `plan: "free"`.
     - **If existing shop** → updates name/email/currency/timezone/country only. **Plan is never overwritten here.**
   - Reads `Shop.plan` from DB (defaults to `"free"` if null).
   - Returns `{ apiKey, appPlan, apartmentCount, apartmentLimit, renewalDate }` to the layout.
5. App renders the main navigation and `PlanCard` using the loader data.
6. The storefront theme extension must be **enabled** separately:
   - Merchant goes to **Online Store → Themes → Customize**.
   - Enables the **Rentfic App Embed** block.
   - Sets `enabled = true` and optionally configures `primaryColor`, `buttonText`.

---

## 2. Creating an Apartment

### Prerequisites
- Merchant must have a Shopify Product to link.
- Free plan = max 1 apartment. Pro/Business = unlimited.

### Step-by-Step

1. Merchant navigates to **Apartments Settings** → clicks **Create Apartment**.
2. A **Shopify Resource Picker** opens (client-side, App Bridge).
3. Merchant selects a product → app navigates to `/app/apartments/new?productId=...&productTitle=...`.
4. **Loader runs:**
   - Reads `Shop.plan` → `getPlanLimits()` → gets apartment limit.
   - Counts existing `Apartment` records for this shop.
   - If `count >= limit` → returns `{ limitReached: true }` → component shows upgrade wall instead of the form.
5. Merchant fills in the apartment form:
   - **Booking Settings:** Name, Status, Description, Booking Type (Single / Range / Multiple), Max Adults/Children/Infants.
   - **Block Dates:** Pick specific unavailable dates via date picker.
   - **Availability:** Calendar start/end date, Check-in/Check-out time, Min/Max days, Quantity selector toggle, Weekly schedule (per-day on/off).
   - **Stock Management:** Bedrooms, Bathrooms, Max Guests, Stock Quantity, Address/City/Country.
   - **Price:** Price per night, Additional Fees (flat or %, per booking or per night), Discounted Dates (date groups with discount), Conditional Discounts (based on min nights / min total / min qty).
   - **Deposit:** Enable deposit toggle → set type (% or flat) + amount → optionally enable Auto Balance Invoice.
   - **Features & Amenities:** Add custom or pick from suggestions list.
6. Merchant clicks **Save** (via `SaveBar`).
7. **Action runs:**
   - Builds `core` object (top-level DB columns) + `settings` JSON blob.
   - `prisma.apartment.create({ data: { ...core, settings } })`.
   - `syncVariantPrice(admin, productId, pricePerNight)`:
     - Looks up the first variant of the Shopify product by GID.
     - Updates `inventoryPolicy` to `CONTINUE` (never sold out).
     - Sets variant price to `pricePerNight`.
     - Disables inventory tracking (`inventoryItemUpdate: { tracked: false }`).
   - `setRentficMetafields(admin, productId, settings)`:
     - Sets `rentfic.is_apartment = "true"` on the Shopify product.
     - Sets `rentfic.additional_fees = JSON` metafield.
   - Redirects to `/app/apartments/:id?saved=1`.
8. Toast shows **"Apartment created"**.
9. The storefront widget will now appear on this product's page.

---

## 3. Editing an Apartment

### Step-by-Step

1. Merchant navigates to **Apartments Settings** → clicks the **Edit** icon on an apartment row.
2. **Loader:** Fetches `Apartment` record from DB (scoped by `shop` + `id`). Returns `{ apartment, limitReached: false }`.
3. All form fields are pre-populated from `apartment.settings` + top-level columns.
4. A **Shopify SaveBar** appears at the top whenever any field changes (`isDirty = true`).
5. On **Save:**
   - Same flow as Create but calls `prisma.apartment.update(...)` instead of `create`.
   - Calls `syncVariantPrice()` and `setRentficMetafields()` again to keep Shopify in sync.
   - Returns `{ success: true }`.
6. Toast shows **"Saved"**. `isDirty` resets to `false`. SaveBar hides.
7. On **Discard:** All state fields reset to their original values loaded from DB.

---

## 4. Deleting an Apartment

### Step-by-Step

1. Merchant clicks the **Delete** icon on the apartment list row.
2. A confirmation dialog appears (App Bridge `useAppBridge().modal.confirm`).
3. On confirm, a `POST` is submitted to `app.apartments._index.jsx` with `intent: "delete"` and `id`.
4. **Action runs:**
   - `prisma.apartment.delete({ where: { id } })`.
   - Fetches the apartment's `productId`.
   - Calls Shopify GraphQL `productUpdate` to set `rentfic.is_apartment = "false"` on the product metafield.
5. The apartment row disappears from the list.
6. The booking widget will no longer appear on that product's storefront page (because `found: false` is returned by the proxy API).

---

## 5. Storefront Widget — Boot & Display

### Step-by-Step

1. Customer navigates to a product page in the Shopify store.
2. `rentfic-booking.js` runs (injected via the App Embed block).
3. **Boot check:**
   - Looks for `#rentfic-app-embed` element in the DOM.
   - If `dataset.enabled === "false"` → exits silently.
   - Extracts product handle from `window.location.pathname` using regex `/\/products\/([^/?#]+)/`.
   - Fetches `/products/:handle.js` to get the numeric Shopify `product.id`.
4. **Widget injection:**
   - Creates `<div id="rentfic-booking-widget">` with data attributes from the embed block (currency, moneyFormat, primaryColor, buttonText).
   - Tries to insert **before** the product form (`.product-form`, `form[action*="/cart/add"]`).
   - Falls back to after product description, then inside product container, then `<main>`.
   - Shows a loading spinner.
5. **`new RentficWidget(container)` is created.**
6. **`_init()` runs:**
   - Fetches `/apps/rentfic/apartment/:productId` (App Proxy → `api.proxy.apartment.$productId.jsx`).
   - Server authenticates via `authenticate.public.appProxy`, looks up `Apartment` by `productId` (scoped to shop).
   - Returns `{ found, apartment, shopSettings }`.
   - If `found: false` → widget shows "Checking availability…" and stops.
7. **Widget renders:**
   - Sets `calOpen` based on `shopSettings.displayCalendar` (`"always_open"` or `"default"`).
   - Calls `_setInitialViewMonth()` — jumps to first available month if `startCalendar === "first_available"`.
   - Renders the full calendar + guest selector + price summary + Reserve Now button.

---

## 6. Customer Makes a Booking (Reserve Now)

### Step-by-Step

1. Customer selects dates (single / range / multiple) on the widget calendar.
   - Blocked dates appear greyed out and are not clickable.
   - Days disabled by weekly availability are greyed out.
   - Min/max day constraints are enforced during range selection.
2. Customer adjusts guest counts (Adults / Children / Infants) within the max limits.
3. If `quantityEnabled`, customer sets a quantity.
4. Widget calculates and displays total price in real time (`_calcTotal`):
   - Base = `pricePerNight × nights × quantity`
   - + Additional fees (flat or %, per booking or per night)
   - − Conditional discounts (met conditions only)
5. Customer clicks **Reserve Now**.
6. Widget POSTs to `/apps/rentfic/booking` (App Proxy → `api.proxy.booking.jsx`):
   ```json
   {
     "apartmentId": "...",
     "startDate": "2025-07-10",
     "endDate": "2025-07-15",
     "nights": 5,
     "bookingType": "range",
     "guests": { "adults": 2, "children": 1, "infants": 0 },
     "quantity": 1
   }
   ```
7. **Server-side (`api.proxy.booking.jsx`):**
   - `authenticate.public.appProxy` → extracts `shop` domain.
   - Fetches `Apartment` from DB (scoped to shop + apartmentId).
   - **Conflict check:**
     - If `quantityEnabled`: counts all non-cancelled bookings overlapping this date range. Rejects if `count >= stockQuantity`.
     - Otherwise: rejects if *any* non-cancelled booking overlaps.
   - Re-calculates `finalTotal` server-side (authoritative).
   - If deposit enabled: calculates `depositAmount`.
   - `prisma.booking.create({ status: "pending", ... })`.
   - **If deposit enabled:**
     - Calls `getOrCreateDepositVariant()` → finds or creates a "Deposit" product in Shopify.
     - Calls `updateVariantPriceByGid()` → sets the deposit product's price to `depositAmount`.
     - Returns `{ bookingId, finalTotal: depositAmount, variantGid: depositVariantGid, isDeposit: true }`.
   - **If no deposit:**
     - Calls `updateVariantPriceByGid(apartmentVariantGid, finalTotal)`.
     - Returns `{ bookingId, finalTotal, variantGid: apartmentVariantGid }`.
8. Widget receives the response → adds the correct product variant to cart via `/cart/add.js`:
   ```json
   {
     "id": "<variantGid>",
     "quantity": 1,
     "properties": {
       "_booking_id": "...",
       "_start_date": "2025-07-10",
       "_end_date": "2025-07-15",
       "_nights": "5",
       "_guests": "{\"adults\":2,\"children\":1,\"infants\":0}",
       "_total": "450.00"
     }
   }
   ```
9. Widget redirects to cart or checkout based on `shopSettings.redirectAfterCart`.

---

## 7. Order Created → Booking Confirmed (Webhook)

### Step-by-Step

1. Customer completes checkout → Shopify fires `orders/create` webhook.
2. App receives `POST /webhooks/orders/create`.
3. `authenticate.webhook(request)` validates the HMAC signature.
4. Handler iterates over `order.line_items`:
   - Filters items that have a property named `_booking_id`.
   - For each matching item:
     a. Reads `_booking_id` from line item properties.
     b. `prisma.booking.update({ status: "confirmed", orderId, orderNumber, customerName, customerEmail })`.
     c. Fetches `Shop` record for the shop's owner email.
     d. Calls `sendNotification(shop, "bookingConfirmation", vars, { to: customerEmail })`.
     e. Calls `sendNotification(shop, "ownerNewBooking", vars, { to: shopOwnerEmail })`.
5. Non-Rentfic line items (no `_booking_id`) are silently skipped.
6. Returns HTTP `200` to Shopify.

---

## 8. Booking Management — Admin View

### Step-by-Step

1. Merchant navigates to **Booking** in the admin.
2. **Loader (`app.booking.jsx`):**
   - Calls `backfillOrderTags(admin, shop)` once per server process — adds `"rentfic"` tag to all linked Shopify orders.
   - Calls `syncUnlinkedBookings(admin, shop)` — fetches unlinked bookings and tries to match them to Shopify orders by product ID + date overlap in line item properties.
   - Fetches all bookings for the shop with filters: status, apartment, date range, search query.
   - Returns paginated list of bookings.
3. Merchant can:
   - **Search** by guest name, email, or order number.
   - **Filter** by status (All / Pending / Confirmed / Completed / Cancelled).
   - **Filter** by apartment.
   - **Filter** by date range.
   - **Paginate** through results (10 per page).
4. Each booking row shows: Order #, Guest, Apartment, Check-in, Check-out, Nights, Total, Status badge, action buttons.
5. **Send Invoice button** (visible when `draftOrderUrl` exists):
   - POSTs to `app.booking.jsx` action with `intent: "sendInvoice"`.
   - Calls Shopify GraphQL `draftOrderInvoiceSend` to email the payment link.
   - Updates `balanceStatus = "invoiced"` in DB.
6. **Create Balance Invoice button** (visible when deposit paid but no draft order yet):
   - POSTs with `intent: "createInvoice"`.
   - Calls `createDraftOrder(admin, booking, balanceAmount)`.
   - Saves `draftOrderId` and `draftOrderUrl` to the booking in DB.

---

## 9. Booking Detail — Status Change & Balance Invoice

### Step-by-Step

1. Merchant clicks a booking row → navigates to `/app/booking/:id`.
2. **Loader:** Fetches `Booking` from DB (scoped to shop). Returns structured booking object with formatted dates, currency.
3. Detail page shows:
   - Guest name, email, apartment, check-in, check-out, nights, quantity, booking type.
   - Total, deposit amount, balance due.
   - Status badge.
   - Shopify order link (if linked).
4. **Change Status:**
   - Merchant selects a status from the dropdown (Pending / Confirmed / Completed / Cancelled).
   - `fetcher.submit(fd, { method: "POST" })` → action updates `booking.status` in DB.
   - Page re-renders with new status badge.
5. **Back button** → returns to booking list.

---

## 10. Email Notifications — Immediate Triggers

### When Sent

| Notification | Trigger | Recipient |
|---|---|---|
| `bookingConfirmation` | Order created webhook fires | Guest (customer email) |
| `ownerNewBooking` | Order created webhook fires | Shop owner email |
| `bookingCancelled` | *(not auto-triggered yet — pending feature)* | Guest |

### Step-by-Step (Booking Confirmation)

1. `webhooks.orders.create.jsx` calls `sendNotification(shop, "bookingConfirmation", vars, { to: customerEmail })`.
2. `email.server.js → sendNotification()`:
   - Loads `NotificationConfig` for this shop from DB.
   - Merges saved templates over `DEFAULT_TEMPLATES.bookingConfirmation`.
   - Checks `tpl.enabled` — if `false`, returns `{ skipped: true }`.
   - Fills `{{variables}}` in subject and body with booking vars.
   - Calls `resolveTransport(config)`:
     - **Priority 1:** Merchant's SMTP (`emailProvider === "smtp"` and `smtpHost` set).
     - **Priority 2:** App-level SMTP from `process.env.SMTP_HOST`.
     - **Priority 3:** Ethereal test inbox (dev only, auto-created, cached).
   - Sends email via nodemailer.
   - Returns `{ sent: true }` or `{ sent: true, preview: "url" }` (Ethereal).

---

## 11. Email Notifications — Time-Based (Cron)

### Step-by-Step

1. An external cron service calls `POST /api/reminders` once per day.
2. Request must include header: `x-cron-secret: <CRON_SECRET env var>`.
3. Handler gets `today` and `tomorrow` as date-only strings.
4. Fetches all `NotificationConfig` records (one per shop).
5. For each shop, fetches all **confirmed** bookings with a `customerEmail`.
6. For each booking, checks four rules:

   | Rule | Condition | Email Type |
   |---|---|---|
   | Check-in Day | `booking.startDate === today` | `checkinDay` |
   | Check-out Reminder | `booking.endDate === tomorrow` | `checkoutReminder` |
   | Booking Reminder | `today === startDate - reminderDays` | `bookingReminder` |
   | Review Request | `today === endDate + reviewDays` | `reviewRequest` |

7. For each matching rule → calls `maybeSend(shop, booking, type, vars)`:
   - Checks `NotificationLog` for a `[bookingId, type]` unique record.
   - If already exists → skips (prevents duplicate sends).
   - Creates `NotificationLog` entry.
   - Calls `sendNotification()`.
8. Returns `{ ok: true, sent: N, skipped: N, date: "YYYY-MM-DD" }`.

---

## 12. Notification Settings — SMTP Setup

### Step-by-Step

1. Merchant navigates to **Notifications** in the admin.
2. **Loader:** Fetches `NotificationConfig` record for this shop from DB.
3. Page has two tabs: **Email Provider** and notification type tabs (Confirmation, Reminder, etc.).

### Email Provider Setup
4. Merchant selects **SMTP** from the email provider dropdown.
5. Fills in: SMTP Host, Port, Encryption (TLS/SSL/None), Username, Password, From Name, From Email.
6. Clicks **Send Test Email** → action with `_intent: "test"`:
   - Calls `sendNotification(shop, type, DUMMY_VARS, { to: testEmailAddress })`.
   - Returns `{ testResult: { sent, preview? } }`.
   - Toast shows success or failure.
7. Clicks **Save** → action upserts `NotificationConfig` in DB.

### Template Customization
8. Merchant clicks a notification tab (e.g., "Booking Reminder").
9. Can toggle **Enabled/Disabled** for that notification type.
10. For timed notifications (Booking Reminder, Review Request) → sets timing in days.
11. Edits **Subject** and **Body** with supported `{{variable}}` placeholders.
12. Clicks a placeholder badge to insert it at cursor position.
13. Saves → all templates are stored as a single `templates` JSON field in `NotificationConfig`.

---

## 13. Global Settings

### Step-by-Step

1. Merchant navigates to **Global Settings**.
2. **Loader:** Reads `Shop.settings` JSON from DB.
3. Merchant configures:

   | Setting | Effect |
   |---|---|
   | **Timezone** | Used in date calculations and display |
   | **Time Format** | 12h or 24h shown in widget |
   | **Translation** | Automatic or manual language setting |
   | **Redirect After Cart** | Where customer goes after "Reserve Now" (cart, checkout, or stay) |
   | **Display Calendar** | `always_open` = calendar visible on page load; `default` = collapsed |
   | **Global Blocked Dates** | Dates blocked across ALL apartments |
   | **Deposit Type & Value** | Global deposit defaults (overridden per apartment) |

4. Clicking **Save** → `SaveBar` submits form → action updates `Shop.settings` JSON in DB → toast "Settings saved".

---

## 14. Subscription & Billing — Upgrade

### Step-by-Step

1. Merchant navigates to **Subscription**.
2. **Loader:**
   - Reads `Shop.plan` from DB.
   - Calls `billing.check({ plans: ["Pro", "Business"], isTest: true })`.
   - Returns `{ currentPlan, shopifyPlan, apartmentCount, apartmentLimit }`.
3. Page shows current plan banner, usage progress bar, and three plan cards (Free / Pro / Business).
4. Merchant can toggle **Monthly / Yearly** billing (yearly shows -20% badge).
5. Merchant clicks **Upgrade to Pro** (or Business).
6. **Action (`intent: "upgrade"`):**
   - Calls `billing.request({ plan: "Pro", isTest: true, returnUrl: "/app/subscribtion" })`.
   - Redirects merchant to Shopify's billing confirmation URL.
7. Merchant approves on Shopify's billing page.
8. Shopify fires `app_subscriptions/update` webhook:
   - Handler verifies HMAC.
   - Reads `payload.app_subscription.status` and `payload.app_subscription.name`.
   - If `status === "ACTIVE"` → `planKeyFromName(name)` → e.g., `"pro"`.
   - `prisma.shop.upsert({ plan: "pro" })`.
9. On next page load, `app.jsx` loader reads `plan: "pro"` → `getPlanLimits("pro")` → `apartments: Infinity`.
10. `PlanCard` shows Pro badge and renewal date.

---

## 15. Subscription & Billing — Cancel

### Step-by-Step

1. Merchant clicks **Cancel Subscription** on the Subscription page.
2. **Action (`intent: "cancel"`):**
   - Calls `billing.cancel({ isTest: true, prorate: false })`.
   - Catches errors silently (in case no active subscription).
   - Redirects back to `/app/subscribtion`.
3. Shopify fires `app_subscriptions/update` with `status: "DECLINED"` or `"CANCELLED"`.
4. Webhook handler updates `Shop.plan = "free"` in DB.
5. On next load, plan limits revert to free (1 apartment max).

---

## 16. Dashboard Stats

### Step-by-Step

1. Merchant navigates to **Dashboard** (default page).
2. **Loader** runs 7 parallel database queries:
   ```
   prisma.shop.findUnique           → shop record (plan)
   prisma.booking.count             → total bookings ever
   prisma.apartment.count (active)  → active apartments
   prisma.apartment.count (all)     → total apartments
   prisma.booking.aggregate._sum    → revenue this month (confirmed + completed only)
   prisma.booking.count (month)     → new bookings this month
   prisma.booking.count (cancelled) → cancellations this month
   prisma.booking.findMany (last 5) → recent bookings
   ```
3. Dashboard renders:
   - **Overview stats strip:** Total Bookings | Active Apartments | Revenue This Month | Avg Nights/Stay.
   - **Recent Bookings table:** Last 5 bookings with Order #, Guest, Apartment, Check-in, Check-out, Total, Status badge.
   - **PlanCard:** Current plan, apartment usage.

---

## 17. Plan Enforcement (Limits)

### Where Limits Are Enforced

| Check Point | File | What Happens |
|---|---|---|
| Create apartment | `app.apartments.$id.jsx` (loader) | Shows upgrade wall if `count >= limit` |
| Navigate to apartment list | `app.apartments._index.jsx` | Shows "Add Apartment" button as disabled with tooltip |
| App layout | `app.jsx` (loader) | Passes `apartmentLimit` to all pages via layout loader |

### Free Plan Limit Flow

1. Merchant on Free plan (limit = 1) has 1 apartment.
2. Clicks "Create Apartment" → navigates to `/app/apartments/new`.
3. Loader: `count (1) >= limit (1)` → `limitReached: true`.
4. Component renders: upgrade wall with message "You are using 1 of 1 apartments on the Free plan."
5. Buttons: **Upgrade Plan** (→ `/app/subscribtion`) and **Back to Apartments**.

---

## 18. Price Reset After Cart

### Problem
After a booking, the Shopify variant price is set to the booking total. If the customer abandons the cart, the next customer sees the wrong price.

### Step-by-Step

1. Customer abandons the cart (back button, closes browser, etc.).
2. The next customer who loads the product page → widget calls `/apps/rentfic/apartment/:productId` (normal boot).
3. Separately, the widget (or a backend process) can call `/api/proxy/price-reset` with `{ productId }`.
4. `api.proxy.price-reset.jsx` handler:
   - Authenticates via app proxy.
   - Fetches the apartment's `pricePerNight` from DB.
   - Calls Shopify GraphQL to reset the variant price back to `pricePerNight`.
5. Price is restored to the "base" nightly rate for display.

---

## 19. App Uninstall

### Step-by-Step

1. Merchant uninstalls Rentfic from their Shopify admin.
2. Shopify fires `app/uninstalled` webhook.
3. `webhooks.app.uninstalled.jsx` handler:
   - `authenticate.webhook(request)` validates HMAC.
   - Deletes all `Session` records for this shop from the database.
4. Shop data (`Shop`, `Apartment`, `Booking`, `NotificationConfig`, `NotificationLog`) is **not deleted** — retained for potential reinstallation.

> **Note:** If full data purge on uninstall is needed, add `prisma.shop.delete()` etc. to this webhook handler.

---

## Appendix — Data Models Summary

```
Shop
  ├─ shop (unique domain)
  ├─ plan (free | pro | business)
  ├─ settings (JSON: timezone, timeFormat, translate, redirectAfterCart,
  │            displayCalendar, blockedDates, depositType, depositValue,
  │            depositVariantGid)
  └─ currency, timezone, country, email, name

Apartment
  ├─ productId (Shopify GID)
  ├─ pricePerNight (queryable column)
  ├─ status (active | draft | inactive)
  └─ settings (JSON: all other fields — bookingType, availability,
               blockedDates, amenities, fees, discounts, deposit, etc.)

Booking
  ├─ status (pending | confirmed | completed | cancelled)
  ├─ orderId / orderNumber (Shopify order link)
  ├─ depositAmount / totalPrice / balanceStatus
  ├─ draftOrderId / draftOrderUrl (balance invoice)
  └─ lineItemProperties (JSON: guests, quantity, bookingType, dates)

NotificationConfig
  ├─ emailProvider (default | smtp)
  ├─ smtpHost/Port/User/Pass/Encryption/FromName/FromEmail
  └─ templates (JSON: per-type subject, body, enabled, timing)

NotificationLog
  └─ [bookingId + type] unique — prevents duplicate time-based emails
```

---

## Appendix — Environment Variables Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SHOPIFY_API_KEY` | App API key (public) |
| `SHOPIFY_API_SECRET` | App API secret |
| `SCOPES` | Required OAuth scopes |
| `SHOPIFY_APP_URL` | Tunnel / production app URL |
| `CRON_SECRET` | Shared secret for `/api/reminders` cron endpoint |
| `SMTP_HOST` | App-level SMTP host (fallback for all shops) |
| `SMTP_PORT` | App-level SMTP port |
| `SMTP_USER` | App-level SMTP username |
| `SMTP_PASS` | App-level SMTP password |
| `SMTP_FROM_NAME` | Sender name for app-level SMTP |
| `SMTP_FROM_EMAIL` | Sender email for app-level SMTP |
| `SMTP_ENCRYPTION` | `tls` or `ssl` |

---

*Last updated: September 2026 | Rentfic v1.x*
