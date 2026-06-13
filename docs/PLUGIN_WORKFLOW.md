# Rentfic — Full Plugin Workflow & Code Review Reference

> Use this alongside `QA_TESTING.md` as the reference for how each feature is supposed to work.

---

## Architecture Overview

```
Shopify Admin (Embedded App)
  └─ app/routes/app.jsx             ← Shared layout (nav + plan data)
       ├─ app._index.jsx            ← Dashboard
       ├─ app.apartments._index.jsx ← Apartment list
       ├─ app.apartments.$id.jsx    ← Create / edit apartment
       ├─ app.settings.jsx          ← Global settings
       ├─ app.booking.jsx           ← Booking management
       ├─ app.notifications.jsx     ← Email templates + SMTP
       └─ app.subscribtion.jsx      ← Plan & billing

Shopify Storefront (Theme Extension)
  └─ extensions/rentfic/
       ├─ rentfic-booking.js        ← Vanilla JS widget (injected on product pages)
       └─ rentfic-booking.css       ← Widget styles

Shopify App Proxy  (/apps/rentfic/*)
  ├─ api.proxy.apartment.$productId ← Widget data fetch
  ├─ api.proxy.booking              ← Reserve action
  └─ api.proxy.price-reset          ← Price reset after cart

Webhooks
  ├─ webhooks.orders.create         ← Confirms booking, sends emails
  ├─ webhooks.app.uninstalled       ← Cleans up sessions
  ├─ webhooks.app.scopes_update     ← Scope changes
  └─ webhooks.app_subscriptions.update ← Updates plan in DB

Cron
  └─ api.reminders                  ← Daily time-based email triggers

Server Utilities
  ├─ app/plans.server.js            ← Plan limits & billing plan names
  ├─ app/email.server.js            ← Email sending (SMTP / Ethereal)
  ├─ app/notification-defaults.js   ← Default email templates
  └─ app/components/PlanCard.jsx    ← Shared plan status card
```

---

## Flow 1 — App Layout (Every Page Load)

```
Request → authenticate.admin(request)
       → GraphQL: shop info + activeSubscriptions
       → prisma.shop.upsert (name/email/currency — NOT plan)
       → prisma.shop.findUnique → read app plan
       → prisma.apartment.count → usage count
       → return { apiKey, appPlan, apartmentCount, apartmentLimit, renewalDate }

PlanCard reads this via useRouteLoaderData("routes/app")
→ renders at top of every page
```

**Key rule:** `Shop.plan` is NEVER updated by the layout loader. It is only:
- Set to `"free"` on first `create`
- Updated by `webhooks.app_subscriptions.update` when billing changes

---

## Flow 2 — Creating an Apartment

```
Admin clicks "Create Apartment"
→ Shopify resource picker (client-side)
→ Navigate to /app/apartments/new?productId=...&productTitle=...

Loader (new):
→ Check Shop.plan → getPlanLimits()
→ Count existing apartments
→ If count >= limit → return { limitReached: true }
   Component renders upgrade wall, not the form

On Save:
→ action() → prisma.apartment.upsert
→ syncVariantPrice() → Shopify GraphQL to update variant price
→ redirect to /app/apartments
```

---

## Flow 3 — Widget Boot (Storefront)

```
Page load → rentfic-booking.js checks #rentfic-app-embed element
→ Matches /products/:handle in URL
→ Fetches /products/:handle.js to get productId
→ Injects <div id="rentfic-booking-widget"> before product form

new RentficWidget(container):
→ fetch /apps/rentfic/apartment/:productId  (via App Proxy)
→ Response: { found, apartment, shopSettings }
→ If not found → widget removes itself
→ Sets calOpen based on shopSettings.displayCalendar
→ Calls _render()
```

**App Proxy route:** `api.proxy.apartment.$productId.jsx`
- Authenticates via `authenticate.public.appProxy`
- Returns apartment settings + shop-level settings
- Never returns sensitive data (no SMTP credentials, no plan info)

---

## Flow 4 — Making a Booking (Reserve Now)

```
Customer selects dates / guests / quantity
→ Widget calculates total client-side (_calcTotal)
→ Clicks "Reserve Now"

POST /apps/rentfic/booking:
  Body: { apartmentId, startDate, endDate, nights, bookingType, guests, quantity }

Server:
  1. authenticate.public.appProxy
  2. Find apartment (scoped by shop)
  3. Conflict check:
     - If quantityEnabled: count booked units in date range, check stock
     - Else: check for any overlapping booking
  4. calcTotal() server-side (mirrors widget)
  5. prisma.booking.create → status: "pending"
  6. updateVariantPrice() → sets Shopify variant price to finalTotal
  7. Return { bookingId, finalTotal, resetPrice }

Widget receives response:
  → Adds product to cart via /cart/add.js
    Properties: { _booking_id, _start_date, _end_date, _nights, _guests, _total }
  → Redirects based on shopSettings.redirectAfterCart
```

**Price integrity:** Server recalculates total independently. Widget total is display-only. The server total is the authoritative value set as the Shopify price.

---

## Flow 5 — Order Placed (Webhook)

```
Shopify → POST /webhooks/orders/create

Handler:
  1. authenticate.webhook(request)
  2. Filter line_items where properties includes { name: "_booking_id" }
  3. For each matching item:
     a. prisma.booking.update → status: "confirmed", orderId, customerName, customerEmail
     b. sendNotification(shop, "bookingConfirmation", vars, { to: customerEmail })
     c. sendNotification(shop, "ownerNewBooking", vars, { to: shopRecord.email })
  4. Return 200
```

**If no `_booking_id` property** → webhook returns 200 silently. Non-rentfic orders are ignored.

---

## Flow 6 — Email Sending

```
sendNotification(shop, type, vars, { to })

Priority chain:
  1. Merchant SMTP (emailProvider === "smtp" && smtpHost set)
  2. App env SMTP (process.env.SMTP_HOST)
  3. Ethereal test inbox (auto-created, cached in module scope)

Template resolution:
  - Load NotificationConfig for shop
  - Merge saved templates over DEFAULT_TEMPLATES
  - Check template.enabled → skip if false
  - Fill {{ variables }} with vars object
  - Send via nodemailer

Returns:
  { sent: true }                   → success
  { sent: true, preview: "url" }   → Ethereal (dev only)
  { skipped: true, reason: "..." } → disabled or no recipient
```

---

## Flow 7 — Daily Reminders (Cron)

```
POST /api/reminders
Header: x-cron-secret: <CRON_SECRET>

For every shop:
  For every confirmed booking:
    maybeSend(shop, bookingId, "checkinDay")      → if today === startDate
    maybeSend(shop, bookingId, "checkoutReminder")→ if today === day before endDate
    maybeSend(shop, bookingId, "bookingReminder") → if today === startDate - reminderDays
    maybeSend(shop, bookingId, "reviewRequest")   → if today === endDate + reviewDays

maybeSend():
  → Check NotificationLog for [bookingId, type] unique pair
  → If already sent → skip
  → Send email → create NotificationLog entry
```

---

## Flow 8 — Subscription Upgrade

```
User clicks "Upgrade to Pro" on /app/subscribtion

action():
  1. authenticate.admin
  2. billing.request({ plan: "Pro", isTest: true, returnUrl })
  3. return redirect(confirmationUrl)   ← Shopify payment page

User completes payment on Shopify →

Webhook: POST /webhooks/app_subscriptions/update
  payload.app_subscription.status === "ACTIVE"
  payload.app_subscription.name === "Pro"
  → planKeyFromName("Pro") → "pro"
  → prisma.shop.upsert({ plan: "pro" })

Next page load:
  → app.jsx loader reads Shop.plan = "pro"
  → getPlanLimits("pro") → apartments: Infinity
  → PlanCard shows Pro badge, renewal date
```

---

## Code Review — Key Files & What to Check

### `app/shopify.server.js`
- `billing` config must list `"Pro"` and `"Business"` with correct amounts
- `BillingInterval.Every30Days` used (not `Annual`)
- Remove `isTest: true` in billing config for production

### `app/plans.server.js`
- `PLAN_LIMITS` is the single source of truth for feature gates
- `planKeyFromName()` maps Shopify subscription name → our key
- Any new plan feature gating starts here

### `app/email.server.js`
- Ethereal `_ethereal` variable cached at module level — only one test account created
- `resolveTransport()` priority order: merchant SMTP → env SMTP → Ethereal
- `sendNotification()` checks `tpl.enabled` before sending

### `extensions/rentfic/assets/rentfic-booking.js`
- `_calcTotal()` in widget must stay in sync with `calcTotal()` in `api.proxy.booking.jsx`
- `_reserve()` must set `_booking_id` as a line item property
- `calOpen` initialized in constructor (`true` = calendar visible by default)

### `prisma/schema.prisma`
- `Shop.plan` has no `@default` — null is treated as "free" by `getPlanLimits()`
- `NotificationLog @@unique([bookingId, type])` prevents duplicate reminders
- All models have `@@index([shop])` for multi-tenant query performance

### `shopify.app.toml`
- Three webhooks registered: `app/uninstalled`, `app/scopes_update`, `app_subscriptions/update`
- App proxy: prefix `apps`, subpath `rentfic`, maps to `/api/proxy`

---

## Common Failure Modes & Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Widget does not appear on product page | Product not linked as apartment, or apartment status = inactive | Create apartment for that product |
| Widget loads then disappears | `found: false` from API — product ID mismatch | Check `Apartment.productId` matches Shopify product GID |
| "Selected dates are no longer available" on fresh date | Old pending booking blocking dates | Clear stale pending bookings from DB |
| Booking stays "pending" after checkout | Webhook `orders/create` not firing | Check webhook registered in Shopify + tunnel active |
| No confirmation email | SMTP not configured + Ethereal fallback | Check server console for Ethereal preview URL |
| Plan card shows wrong plan | `app.jsx` loader was overwriting `Shop.plan` | Fixed: layout loader never touches `plan` in `update` |
| Subscription upgrade not reflected | `app_subscriptions/update` webhook not registered | Run `shopify app deploy` |
| `billing.check()` crashes | No active subscription exists | Fixed: wrapped in try/catch |
| Login page appears in dev | Session token expired | Enter shop domain in login form |
