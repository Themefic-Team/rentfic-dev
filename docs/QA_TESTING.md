# Rentfic — QA Testing & Code Review Document

**App:** Rentfic (Shopify Rental Booking App)  
**Tester:** ___________________________  
**Environment:** ☐ Development  ☐ Staging  ☐ Production  
**Date Started:** ___________________________  
**Date Completed:** ___________________________  
**Build / Commit:** ___________________________

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ☐ | Not tested yet |
| ✅ | Pass |
| ❌ | Fail |
| ⚠️ | Pass with issue (note required) |
| ⏭️ | Skipped / Not applicable |

---

## Section 1 — Installation & Boot

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 1.1 | Install app on dev store via `shopify app dev` | Redirects to Dashboard without error | ☐ | |
| 1.2 | Dashboard loads without blank screen | Page renders with nav and stats | ☐ | |
| 1.3 | All nav links work | Dashboard · Apartments · Settings · Bookings · Notifications · Subscription all navigate correctly | ☐ | |
| 1.4 | `Shop` record created in DB on first load | Row exists with `plan = "free"`, shop domain, name, email | ☐ | |
| 1.5 | Plan card visible on Dashboard | Shows "✦ Free Plan · 0 of 1 apartment used" | ☐ | |
| 1.6 | Plan card visible on all pages | Appears on Apartments, Settings, Bookings, Notifications | ☐ | |
| 1.7 | Session expiry shows login form | "Shop domain" login box appears, not a crash | ☐ | |
| 1.8 | Re-login from session expiry | Enter shop domain → returns to app at correct page | ☐ | |

---

## Section 2 — Global Settings

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 2.1 | Settings page loads with saved values | Fields show previously saved data on reload | ☐ | |
| 2.2 | Save button shows success toast | Green toast appears after save | ☐ | |
| 2.3 | Discard reverts unsaved changes | Fields reset to last saved values | ☐ | |
| 2.4 | `Display Calendar = Always Open` | Widget shows calendar immediately on product page | ☐ | |
| 2.5 | `Display Calendar = Default (toggle)` | Widget shows "Show dates" button; calendar hidden until clicked | ☐ | |
| 2.6 | `Start Calendar = First Available Date` | Calendar opens on first non-blocked, non-past date | ☐ | |
| 2.7 | `Redirect after cart = Checkout` | After reserve → goes to `/checkout` | ☐ | |
| 2.8 | `Redirect after cart = Cart` | After reserve → goes to `/cart` | ☐ | |
| 2.9 | `Redirect after cart = Disabled` | After reserve → shows inline "Booking reserved!" message | ☐ | |
| 2.10 | `From Price = Automatic` | Widget header shows "From $X / night" prefix | ☐ | |
| 2.11 | `From Price = Disabled` | Price hidden from widget header | ☐ | |
| 2.12 | `Quantity position = Product page only` | Quantity stepper not shown inside widget calendar area | ☐ | |
| 2.13 | `Quantity position = Product + Calendar` | Quantity stepper visible in widget | ☐ | |
| 2.14 | Global blocked dates applied in widget | Dates blocked globally not selectable on any apartment | ☐ | |

---

## Section 3 — Apartment Creation

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 3.1 | Click "Create Apartment" → resource picker opens | Shopify product picker appears | ☐ | |
| 3.2 | Selecting a product pre-fills name and product title | Name field and productTitle populated | ☐ | |
| 3.3 | Selecting an already-linked product shows error | Toast: "An apartment already exists for this product" | ☐ | |
| 3.4 | Save apartment with all required fields | Redirects to apartment list, apartment visible | ☐ | |
| 3.5 | SaveBar "Save" / "Discard" buttons appear on change | SaveBar appears when any field is edited | ☐ | |
| 3.6 | Edit existing apartment and save | Changes persisted on reload | ☐ | |
| 3.7 | Delete apartment from list | Apartment removed, Shopify product metafield `is_apartment` set to "false" | ☐ | |
| 3.8 | Apartment `status = inactive` | Widget does not render on product page | ☐ | |
| 3.9 | Booking type: Single day | Calendar allows one date at a time | ☐ | |
| 3.10 | Booking type: Date range | Calendar allows start → end range selection | ☐ | |
| 3.11 | Booking type: Multiple days | Individual days toggle on/off | ☐ | |
| 3.12 | Min nights enforced on range booking | Cannot select end date that creates < minDays nights | ☐ | |
| 3.13 | Max nights enforced on range booking | Cannot select end date that creates > maxDays nights | ☐ | |
| 3.14 | Max days enforced on multiple-day booking | Cannot select more days than maxDays | ☐ | |
| 3.15 | Weekly availability — disable a day | That weekday appears blocked/grey in widget | ☐ | |
| 3.16 | Calendar start/end date bounds respected | Dates outside calendarStartDate / calendarEndDate are greyed out | ☐ | |
| 3.17 | Blocked dates from apartment settings | Those specific dates greyed and unclickable | ☐ | |
| 3.18 | Amenities save and display | Amenity tags saved in settings JSON | ☐ | |
| 3.19 | Additional fee — flat per booking | Fee shows in widget price breakdown | ☐ | |
| 3.20 | Additional fee — flat per night | Fee × nights shows in widget price breakdown | ☐ | |
| 3.21 | Additional fee — percentage of base | Fee = base price × % shows in breakdown | ☐ | |
| 3.22 | Conditional discount — minDays met | Discount line appears, total reduced | ☐ | |
| 3.23 | Conditional discount — minDays NOT met | No discount line shown | ☐ | |
| 3.24 | Conditional discount — minTotal met | Discount fires when base price ≥ threshold | ☐ | |
| 3.25 | Deposit enabled — percent | Deposit line shows in price breakdown | ☐ | |
| 3.26 | Deposit enabled — fixed amount | Fixed deposit amount shows in breakdown | ☐ | |

**Free Plan Limit:**

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 3.27 | Create 2nd apartment on Free plan | Shows "Apartment limit reached" screen with upgrade link | ☐ | |
| 3.28 | "Create Apartment" button when at limit | Button shows "Plan Limit Reached" and is disabled | ☐ | |
| 3.29 | Plan card bar turns red when at limit | Progress bar fills red at 1/1 | ☐ | |
| 3.30 | Upgrade link goes to Subscription page | Clicking "Upgrade to add more" navigates to `/app/subscribtion` | ☐ | |

---

## Section 4 — Storefront Widget

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 4.1 | Widget loads on linked product page | Calendar and booking form appear on storefront | ☐ | |
| 4.2 | Widget absent on non-linked product page | No widget HTML injected | ☐ | |
| 4.3 | Widget shows error state on API failure | Red error box with message (no blank widget) | ☐ | |
| 4.4 | Past dates are greyed and unclickable | Dates before today cannot be selected | ☐ | |
| 4.5 | Blocked dates are greyed | Individual blocked dates unclickable | ☐ | |
| 4.6 | Price breakdown shows base price | `nights × price` row visible | ☐ | |
| 4.7 | Price breakdown shows fees | Each additional fee listed with computed amount | ☐ | |
| 4.8 | Price breakdown shows discount | Discount row with negative value when rule met | ☐ | |
| 4.9 | Guest selector: adults default = 1 | Adults starts at 1, cannot go below 1 | ☐ | |
| 4.10 | Guest selector: children default = 0 | Children/Infants start at 0 | ☐ | |
| 4.11 | Max adults limit enforced | + button disabled/ignored at maxAdults | ☐ | |
| 4.12 | Max guests total enforced | Total adults+children+infants capped at maxGuests | ☐ | |
| 4.13 | Quantity stepper min = 1 | Cannot go below 1 | ☐ | |
| 4.14 | Quantity stepper max = stockQuantity | Cannot exceed stock count | ☐ | |
| 4.15 | Calendar month navigation (prev/next) | Month changes correctly, no jump errors | ☐ | |
| 4.16 | Range hover preview | Hovering over end date shows range highlight | ☐ | |
| 4.17 | Clicking new start date resets range | Previous selection cleared, new start set | ☐ | |
| 4.18 | Check-in / check-out times displayed | Times show in widget if configured | ☐ | |

---

## Section 5 — Reserve Flow (Critical Path)

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 5.1 | Click Reserve Now with no date selected | Button does nothing / disabled | ☐ | |
| 5.2 | Reserve Now sends POST to `/apps/rentfic/booking` | Network tab shows correct request | ☐ | |
| 5.3 | Server-side total matches widget total | `finalTotal` in response equals widget displayed total | ☐ | |
| 5.4 | Booking created in DB with `status = "pending"` | Check `Booking` table after reserve | ☐ | |
| 5.5 | Shopify variant price updated to booking total | Product variant price = finalTotal after reserve | ☐ | |
| 5.6 | Cart item has `_booking_id` line item property | Add to cart, check cart JSON for `_booking_id` | ☐ | |
| 5.7 | Date conflict detection | Same dates on same apartment → 409 "no longer available" | ☐ | |
| 5.8 | Stock quantity conflict detection | Reserve more units than available → "Only X units available" | ☐ | |
| 5.9 | Reserve redirects to checkout (default) | Browser navigates to `/checkout` | ☐ | |
| 5.10 | Reserve redirects to cart (setting) | Browser navigates to `/cart` | ☐ | |
| 5.11 | Reserve shows success message (disabled redirect) | Inline "Booking reserved!" message, no page nav | ☐ | |
| 5.12 | Pending booking blocks same dates | Second attempt on same dates fails with conflict error | ☐ | |
| 5.13 | Multiple quantity reserve works | 2 units reserved, remaining = stockQuantity - 2 | ☐ | |

---

## Section 6 — Order Webhook & Booking Confirmation

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 6.1 | Complete checkout on Shopify | `orders/create` webhook fires | ☐ | |
| 6.2 | Booking status changes to `confirmed` | Bookings page shows "confirmed" badge with order number | ☐ | |
| 6.3 | Booking gets `customerName` and `customerEmail` | Fields populated from Shopify order | ☐ | |
| 6.4 | Booking gets `orderId` and `orderNumber` | `#1001` format visible in Bookings page | ☐ | |
| 6.5 | Confirmation email sent to guest | Email arrives (SMTP) or Ethereal preview logged | ☐ | |
| 6.6 | Owner alert email sent | Email sent to shop owner email address | ☐ | |
| 6.7 | Order without `_booking_id` property | Webhook returns 200 silently, no DB changes | ☐ | |
| 6.8 | Duplicate webhook delivery | Second delivery of same order is idempotent (no double-email) | ☐ | |

---

## Section 7 — Bookings Dashboard

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 7.1 | Bookings page lists all bookings | All pending + confirmed + cancelled bookings visible | ☐ | |
| 7.2 | Status tabs filter correctly | "Pending" tab shows only pending, counts match | ☐ | |
| 7.3 | Search by guest name | Filters list to matching guest | ☐ | |
| 7.4 | Search by apartment name | Filters to matching apartment | ☐ | |
| 7.5 | Search by order ID (#1001) | Filters to that order | ☐ | |
| 7.6 | Search by email address | Filters to bookings from that email | ☐ | |
| 7.7 | Status badge colors correct | Pending=yellow, Confirmed=green, Cancelled=red | ☐ | |
| 7.8 | Pending booking shows partial order ID | Shows `…abc123` (last 6 chars of booking ID) | ☐ | |
| 7.9 | Confirmed booking shows real order number | Shows `#1001` format | ☐ | |
| 7.10 | Plan card visible at top | Free/Pro plan card renders | ☐ | |

---

## Section 8 — Notifications

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 8.1 | Notifications page loads all 7 tabs | All tabs clickable: Booking Confirmation, Reminder, etc. | ☐ | |
| 8.2 | Default template content pre-filled | Subject and body populated from defaults | ☐ | |
| 8.3 | Toggle enable/disable template | Toggle saves and persists on reload | ☐ | |
| 8.4 | Edit subject line → save → reload | Custom subject persists | ☐ | |
| 8.5 | Edit body text → save → reload | Custom body persists | ☐ | |
| 8.6 | Template variables shown in sidebar | `{{product.name}}`, `{{start}}`, etc. listed | ☐ | |
| 8.7 | Send test email (no SMTP) | Server console shows Ethereal URL | ☐ | |
| 8.8 | Open Ethereal preview URL | Email rendered correctly in browser | ☐ | |
| 8.9 | Template variables resolved in test email | `{{customer.firstName}}` → "Jane", etc. | ☐ | |
| 8.10 | Send test email (with SMTP) | Real email arrives in inbox | ☐ | |
| 8.11 | SMTP config saves and persists | Host, port, user, from name persist on reload | ☐ | |
| 8.12 | Switch from SMTP back to Default | Ethereal fallback resumes | ☐ | |
| 8.13 | Disabled template not sent | Toggle off → test button still works but real send skipped | ☐ | |
| 8.14 | Cron endpoint POST `/api/reminders` | Returns 200 with correct secret header | ☐ | |
| 8.15 | Cron endpoint rejects wrong secret | Returns 401 with wrong/missing `x-cron-secret` | ☐ | |
| 8.16 | Reminder deduplication | Running cron twice same day does not send duplicate emails | ☐ | |

---

## Section 9 — Subscription & Plan Enforcement

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 9.1 | Subscription page shows current plan from DB | "Free Plan" shown for new install | ☐ | |
| 9.2 | Apartment usage count is live | Shows correct count matching apartment list | ☐ | |
| 9.3 | Feature comparison table correct | Free: 1 apt, notifications ✓, analytics ✗ | ☐ | |
| 9.4 | Click "Upgrade to Pro" | Redirects to Shopify payment confirmation page | ☐ | |
| 9.5 | Complete test payment | `app_subscriptions/update` webhook fires | ☐ | |
| 9.6 | DB `Shop.plan` updated to `"pro"` after payment | Check DB directly | ☐ | |
| 9.7 | Subscription page shows Pro plan after upgrade | "Pro Plan" badge, renewal date visible | ☐ | |
| 9.8 | Plan card across all pages shows Pro | All pages show "✦ Pro Plan" | ☐ | |
| 9.9 | Pro plan: can create unlimited apartments | 2nd, 3rd apartment creation succeeds | ☐ | |
| 9.10 | Renewal date shown for paid plan | "Renews June 13, 2026" visible in plan card | ☐ | |
| 9.11 | Cancel subscription | Webhook updates `plan` → `"free"` in DB | ☐ | |
| 9.12 | After cancel: apartment limit re-enforced | If >1 apartment exists, creation blocked again | ☐ | |
| 9.13 | Shopify store plan name does NOT overwrite app plan | Layout reload does not reset `plan` to "Basic Shopify" | ☐ | |

---

## Section 10 — Plan Card Component

| # | Test Case | Expected Result | Status | Notes |
|---|-----------|----------------|--------|-------|
| 10.1 | Free plan — 0 apartments used | Bar empty, green, "0 of 1 apartment used" | ☐ | |
| 10.2 | Free plan — 1 apartment used (at limit) | Bar full, RED, "1 of 1", "Upgrade to add more →" | ☐ | |
| 10.3 | Pro plan card color | Green badge "✦ Pro Plan" | ☐ | |
| 10.4 | Business plan card color | Purple badge "✦ Business Plan" | ☐ | |
| 10.5 | Pro/Business shows "Unlimited" | No bar, shows apartment count + "Unlimited" | ☐ | |
| 10.6 | Pro/Business shows renewal date | "Renews [Month DD, YYYY]" visible | ☐ | |
| 10.7 | "Manage →" link for paid plans | Navigates to `/app/subscribtion` | ☐ | |
| 10.8 | "Upgrade plan →" link for free plan | Navigates to `/app/subscribtion` | ☐ | |
| 10.9 | Card not shown if layout data unavailable | Component returns null gracefully (no crash) | ☐ | |

---

## Section 11 — Code Review Checklist

### 11.1 Security

| # | Item | Status | Notes |
|---|------|--------|-------|
| CR-S1 | All admin routes use `authenticate.admin(request)` | ☐ | |
| CR-S2 | All proxy routes use `authenticate.public.appProxy(request)` | ☐ | |
| CR-S3 | All webhook routes use `authenticate.webhook(request)` | ☐ | |
| CR-S4 | Cron endpoint protected by `x-cron-secret` header | ☐ | |
| CR-S5 | No raw SQL queries (all go through Prisma ORM) | ☐ | |
| CR-S6 | No secrets committed to git (`.env` in `.gitignore`) | ☐ | |
| CR-S7 | SMTP password not exposed in API responses | ☐ | |
| CR-S8 | Booking data scoped by `shop` — no cross-tenant leakage | ☐ | |
| CR-S9 | All DB queries filter by `shop: session.shop` | ☐ | |
| CR-S10 | `isTest: true` removed from billing calls before production | ☐ | |

### 11.2 Data Integrity

| # | Item | Status | Notes |
|---|------|--------|-------|
| CR-D1 | `Shop.plan` never overwritten by layout loader (only on `create`) | ☐ | |
| CR-D2 | Booking `status` transitions: pending → confirmed only via webhook | ☐ | |
| CR-D3 | Server-side total calculation mirrors widget calculation | ☐ | |
| CR-D4 | Conflict check runs before booking creation | ☐ | |
| CR-D5 | `NotificationLog` prevents duplicate reminder emails | ☐ | |
| CR-D6 | `prisma.shop.upsert` safe for concurrent first loads | ☐ | |
| CR-D7 | Variant price reset after booking (resetPrice returned to widget) | ☐ | |

### 11.3 Error Handling

| # | Item | Status | Notes |
|---|------|--------|-------|
| CR-E1 | Widget shows user-friendly error if API fails (not blank) | ☐ | |
| CR-E2 | Booking route returns proper HTTP status codes (409 conflict, 404 not found, 400 bad input) | ☐ | |
| CR-E3 | Email send failure does not break order webhook (try/catch) | ☐ | |
| CR-E4 | `billing.check()` wrapped in try/catch (throws when no active sub) | ☐ | |
| CR-E5 | Shop GraphQL sync failure is non-fatal (`console.error`, no throw) | ☐ | |
| CR-E6 | Webhook handler returns 200 even when booking not found | ☐ | |
| CR-E7 | Ethereal account cached (not re-created on every email send) | ☐ | |

### 11.4 Performance

| # | Item | Status | Notes |
|---|------|--------|-------|
| CR-P1 | App layout loader uses `Promise.all` for parallel DB queries | ☐ | |
| CR-P2 | Apartment proxy API uses `Promise.all` for apartment + shop fetch | ☐ | |
| CR-P3 | No N+1 queries in bookings list loader | ☐ | |
| CR-P4 | Prisma indexes on `shop`, `apartmentId`, `orderId` fields | ☐ | |
| CR-P5 | Widget only mounts on product pages (URL match check) | ☐ | |

### 11.5 Code Quality

| # | Item | Status | Notes |
|---|------|--------|-------|
| CR-Q1 | No unused imports (check IDE diagnostics) | ☐ | |
| CR-Q2 | Plan limits centralised in `plans.server.js` (no hardcoded plan logic in pages) | ☐ | |
| CR-Q3 | Email templates centralised in `notification-defaults.js` | ☐ | |
| CR-Q4 | `PlanCard` uses `useRouteLoaderData` (no duplicate fetching) | ☐ | |
| CR-Q5 | Widget price calculation exactly mirrors server (`calcTotal` in proxy.booking) | ☐ | |
| CR-Q6 | Webhook files named to match Shopify topic (`webhooks.orders.create.jsx`) | ☐ | |
| CR-Q7 | No console.log left in production paths (only console.error) | ☐ | |

---

## Section 12 — Pre-Production Checklist

| # | Item | Status | Notes |
|---|------|--------|-------|
| P1 | `SHOPIFY_APP_URL` set to real production domain | ☐ | |
| P2 | `DATABASE_URL` points to production PostgreSQL | ☐ | |
| P3 | `npx prisma db push` run on production DB | ☐ | |
| P4 | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` set in production env | ☐ | |
| P5 | `CRON_SECRET` set to strong random string | ☐ | |
| P6 | Daily cron job scheduled to `POST /api/reminders` with `x-cron-secret` header | ☐ | |
| P7 | `isTest: true` removed from `billing.request()` in `app.subscribtion.jsx` | ☐ | |
| P8 | `isTest: true` removed from `billing.check()` in `app.subscribtion.jsx` | ☐ | |
| P9 | `isTest: true` removed from `billing.cancel()` in `app.subscribtion.jsx` | ☐ | |
| P10 | `shopify app deploy` run to register webhooks in production | ☐ | |
| P11 | All 3 webhooks confirmed registered in Partner Dashboard | ☐ | |
| P12 | App listing info complete in Partner Dashboard | ☐ | |
| P13 | Theme extension published and enabled in Online Store | ☐ | |
| P14 | Test a real end-to-end booking on production store | ☐ | |
| P15 | Confirmation email arrives in real inbox | ☐ | |

---

## Bug Report Template

> Copy this block for each bug found during testing.

```
### Bug #___

**Section:** (e.g. Section 5 — Reserve Flow)
**Test Case:** (e.g. 5.7 — Date conflict detection)
**Severity:** Critical / High / Medium / Low
**Environment:** Dev / Staging / Production

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Result:**

**Actual Result:**

**Screenshot / Console Error:**

**Status:** Open / In Progress / Fixed / Closed
**Fixed in Commit:** 
```

---

## Test Run Summary

| Section | Total Tests | Pass | Fail | Skipped |
|---------|-------------|------|------|---------|
| 1 — Installation | 8 | | | |
| 2 — Global Settings | 14 | | | |
| 3 — Apartment Creation | 30 | | | |
| 4 — Storefront Widget | 18 | | | |
| 5 — Reserve Flow | 13 | | | |
| 6 — Order Webhook | 8 | | | |
| 7 — Bookings Dashboard | 10 | | | |
| 8 — Notifications | 16 | | | |
| 9 — Subscription | 13 | | | |
| 10 — Plan Card | 9 | | | |
| 11 — Code Review | 29 | | | |
| 12 — Pre-Production | 15 | | | |
| **TOTAL** | **183** | | | |

---

**Final Sign-off:**

QA Tester: ___________________________ Date: ___________

Developer: ___________________________ Date: ___________

Approved for Production: ☐ Yes  ☐ No — Reason: ___________________________
