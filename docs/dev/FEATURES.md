# Rentfic — Features & Functionality Reference

> **Verified against**: all files in `app/routes/`, `app/components/`, `extensions/rentfic/`, `app/plans.server.js`, `app/shopify.server.js`

---

## Table of Contents

1. [Billing & Subscription](#1-billing--subscription)
2. [Apartment Management](#2-apartment-management)
3. [Booking Management](#3-booking-management)
4. [Storefront Booking Widget](#4-storefront-booking-widget)
5. [Calendar View](#5-calendar-view)
6. [Email Notification System](#6-email-notification-system)
7. [Analytics](#7-analytics)
8. [Global Settings](#8-global-settings)
9. [Data Export](#9-data-export)
10. [Dashboard](#10-dashboard)
11. [Shared Components](#11-shared-components)

---

## 1. Billing & Subscription

**Route**: `/app/subscribtion` (`app/routes/app.subscribtion.jsx`)

### Plan tiers

| Plan | Price | Key feature unlocked |
|---|---|---|
| Free | $0 | 1 apartment |
| Pro | $19/mo or $182/yr | Unlimited apartments |
| Business | $49/mo or $470/yr | Analytics + Priority support (Crisp chat) |

All paid plans have a 7-day free trial.

### How the plan page works

**Loader**:
1. Reads `Shop.plan` from the database.
2. Calls Shopify Billing API (`billing.check`) to fetch active subscriptions and the next renewal date.
3. Counts current apartments for the plan limit display.

**Actions** (POST intents dispatched by form):
- `subscribe`: Calls Shopify `billing.request()` to create a new subscription. Redirects the merchant to the Shopify payment confirmation screen.
- `cancel`: Calls `billing.cancel()` with the active subscription's GID.

**Plan downgrade behavior**: When a merchant cancels their plan:
- `app_subscriptions/update` webhook fires → `Shop.plan` is set to `"free"`.
- Existing apartments above the free limit (1) are NOT deleted automatically. The merchant simply cannot create new ones and is shown an upgrade prompt.

---

## 2. Apartment Management

**Routes**: `/app/apartments` and `/app/apartments/:id`

### Apartments List (`app/routes/app.apartments._index.jsx`)

Displays a paginated table (10 per page) of all apartments. Features:
- Search by name, product title
- Sort by name / created date
- Per-row actions: Edit, View Calendar, Duplicate, Delete
- Bulk actions: Activate, Deactivate, Delete
- Plan-limit banner if `count >= limit`

**Delete behavior**: Removing an apartment also writes a `productUpdate` GraphQL mutation that sets the Shopify product metafield `rentfic.is_apartment = "false"`, which causes the booking widget to hide on that product page.

### Apartment Detail Editor (`app/routes/app.apartments.$id.jsx`)

A comprehensive settings form with the following sections:

| Section | Fields |
|---|---|
| Basic Info | Name, linked Shopify product (resource picker), status, price per night |
| Booking Type | Single date / Nightly (check-in + check-out) / Multi-date picker |
| Date & Time | Calendar start/end dates, check-in time, check-out time |
| Stay Restrictions | Min nights, max nights |
| Guest Limits | Max adults, max children, max infants, max total guests |
| Availability | Weekly schedule (per day: enabled, open/close time), blocked dates, discounted dates |
| Property Details | Bedrooms, bathrooms, address, city, country, amenities (multi-select with suggestions) |
| Additional Fees | Flat or percentage fees, per-booking or per-night |
| Conditional Discounts | Rule-based discounts (min nights / min total / min guests) |
| Stock / Quantity | Enable quantity selector, set stock quantity |
| Deposit | Enable deposit, set as percentage or fixed amount |

**Save mechanism**: Uses React Router's `useSubmit` + Shopify App Bridge `SaveBar`. All settings are serialized to JSON and stored in `Apartment.settings`.

**Plan limit check on "new"**: If `params.id === "new"` and `count >= limits.apartments`, returns `limitReached: true` and shows an upgrade card instead of the form.

**iCal export button**: Generates a link to `GET /api/export/ical/:apartmentId`.

---

## 3. Booking Management

### Bookings List (`app/routes/app.booking._index.jsx`)

Full-featured booking management table with:
- Search by guest name, email, product title, order number
- Date range filter (check-in)
- Status filter: All / Pending / Confirmed / Cancelled
- Apartment filter
- Pagination (20 per page)
- Balance status column: Pending / Invoiced / Paid

**"Send Balance Invoice" action**: Creates a Shopify Draft Order for the remaining balance (`totalPrice - depositAmount`) and sets `Booking.balanceStatus = "invoiced"`. Returns the draft order invoice URL for the admin to share with the guest.

**"Mark Balance Paid" action**: Sets `Booking.balanceStatus = "paid"`.

**"Cancel" action**: Sets `Booking.status = "cancelled"` and sends `bookingCancelled` + `ownerBookingCancelled` emails.

**Order tag backfill**: On first load per server process per shop, the loader queries all bookings with an `orderId` and uses the Shopify Admin GraphQL `tagsAdd` mutation to add the `"rentfic"` tag to those orders. This runs once per server restart (tracked via an in-memory `Set`).

**Unlinked booking sync**: On load, finds bookings with `orderId: null` and attempts to match them to Shopify orders by customer email and product title. Runs on each page load for unlinked bookings.

### Booking Detail (`app/routes/app.booking.$id.jsx`)

Shows full booking detail with edit capability for: guest name, email, dates, status, notes, prices.

### Manual Booking (`app/routes/app.booking.new.jsx`)

Admin form to create a booking without a storefront transaction. Fields:
- Apartment (dropdown of active apartments)
- Customer name, email
- Check-in / check-out dates
- Status (default: `confirmed`)
- Total price, deposit amount
- Notes
- Option to send confirmation email on creation

---

## 4. Storefront Booking Widget

**Asset**: `extensions/rentfic/assets/rentfic-booking.js` (1278 lines, vanilla IIFE)

### Initialization

On page load, the widget:
1. Reads `#rentfic-app-embed` `data-*` attributes (shop domain, currency, colors).
2. Checks if `data-has-appointment="true"` (set by Liquid based on the product metafield).
3. If true, fetches apartment config from `GET /apps/rentfic/apartment/:productId`.
4. Renders the booking UI into the product page.
5. Fires `CustomEvent("rentfic:ready")` on completion.

### Booking types

| Type | Calendar behavior |
|---|---|
| `single` | Select one date |
| `nightly` | Select check-in then check-out (with min/max night enforcement) |
| `multi` | Select multiple individual dates |

### Price breakdown UI

Shows itemized price calculation live as the user selects dates:
- Base price (`quantity × nights × pricePerNight`)
- Additional fees (flat or percentage)
- Conditional discounts (if rules are met)
- Deposit due now (if deposit enabled)
- Full total

### Booking flow

1. User selects dates and guests, clicks "Reserve Now".
2. Widget `POST`s to `/apps/rentfic/booking` with all parameters.
3. On success, sets the Shopify product variant price to `finalTotal` (or `depositCharged` if deposit).
4. Adds the product to the Shopify cart with hidden `_booking_id` line item property.
5. Redirects to cart or checkout based on `redirectAfterCart` setting.
6. After page unload or cancel, calls `POST /apps/rentfic/price-reset` to restore the variant price.

### Localization

Built-in support for: `en`, `fr`, `de`, `es`, `ar` (with RTL layout). Language is detected from the `translate` shop setting. `"automatic"` uses `navigator.language`.

---

## 5. Calendar View

**Route**: `/app/booking/calendar` (`app/routes/app.booking.calendar.jsx`)

Monthly grid view of all bookings across all apartments. Features:
- Month navigation (previous/next) via `?month=YYYY-MM` query parameter
- Color-coded bookings per apartment (up to 8 distinct colors)
- Apartment color legend in sidebar
- Clicking a booking navigates to its detail page

**Data fetching**: Loads all bookings whose date range overlaps with the displayed month (`startDate <= monthEnd AND (endDate >= monthStart OR endDate null AND startDate >= monthStart)`).

---

## 6. Email Notification System

**Route**: `/app/notifications` (`app/routes/app.notifications.jsx`)

### SMTP configuration

Merchants can configure their own SMTP server:
- Host, port, encryption (TLS / SSL)
- SMTP username and password
- Sender name and sender email

If not configured, the app uses the app-level SMTP environment variables.

### Email template editor

8 configurable templates (see [Webhooks Reference](./WEBHOOKS.md) and [API Reference](./API_REFERENCE.md) for trigger details). Each template has:
- Enable / disable toggle
- Subject line (supports `{{placeholder}}` variables)
- Body text (supports `{{placeholder}}` variables)
- Timing (for `bookingReminder` and `reviewRequest` — days before/after)

**Available placeholder variables**: `{{date}}`, `{{start}}`, `{{end}}`, `{{product.name}}`, `{{product.url}}`, `{{order.name}}`, `{{order.note}}`, `{{customer.firstName}}`, `{{customer.lastName}}`

**Test email**: The notifications page includes a "Send Test" button that sends a test email with `DUMMY_VARS` to a specified address. The action uses `_intent: "test"` form field to distinguish from a config save.

---

## 7. Analytics

**Route**: `/app/analytics` (`app/routes/app.analytics.jsx`)
**Plan gate**: Business plan only. Redirects to `/app/subscribtion` for free/pro plans.

### Metrics displayed

| Metric | Data source |
|---|---|
| Revenue by month (last 12 months) | Aggregate `totalPrice` of `confirmed` + `completed` bookings |
| Booking count by month | Count of bookings per month |
| Booking status breakdown | Count of `pending`, `confirmed`, `completed`, `cancelled` (all time) |
| Top apartments by revenue | Group bookings by `apartmentId`, sum `totalPrice` |
| Top apartments by booking count | Group bookings by `apartmentId`, count |
| Average nights | Average of `nights` field across all bookings |
| Occupancy rate | (booked nights / total nights in period) per apartment |

All charts are rendered client-side (no chart library — SVG/CSS bar charts built in JSX).

---

## 8. Global Settings

**Route**: `/app/settings` (`app/routes/app.settings.jsx`)

Shop-wide settings stored in `Shop.settings` JSON blob:

| Setting | Options | Description |
|---|---|---|
| Timezone | IANA timezone | Used for displaying booking dates |
| Time format | 12h / 24h | Clock format in widget |
| Language | Automatic / en / fr / de / es / ar | Widget language |
| Redirect after cart | Automatic / Cart / Checkout | Post-booking redirect |
| Calendar display | Always open / Collapsed | Widget default state |
| Blocked dates | Date multi-picker | Dates blocked across all apartments |
| Deposit type | Percent / Fixed | Global deposit calculation method |
| Deposit value | Number | Global deposit amount (overridden by per-apartment setting) |

Settings are saved using a `useSubmit` POST form + Shopify App Bridge `SaveBar` for the unsaved changes prompt.

---

## 9. Data Export

### CSV Export (`GET /api/export/bookings`)

Exports all bookings for the shop as a CSV file. Accessible from the Bookings list page via the "Export" button.

**Columns**: ID, Order, Guest, Email, Apartment, Check-in, Check-out, Nights, Total, Deposit, Status, Created

### iCal Export (`GET /api/export/ical/:apartmentId`)

Exports `confirmed` and `completed` bookings as an `.ics` calendar file. Available from each apartment's settings page.
- Pass `apartmentId` = `"all"` to export all apartments combined.
- Only `confirmed` and `completed` bookings are included.

---

## 10. Dashboard

**Route**: `/app` (`app/routes/app._index.jsx`)

Displays a summary of shop activity:

| KPI card | Data |
|---|---|
| Total bookings | `prisma.booking.count` |
| Active apartments | `prisma.apartment.count({ status: "active" })` |
| Revenue this month | `_sum.totalPrice` of confirmed/completed bookings this month |
| New bookings this month | Count of bookings created this month |
| Cancellations this month | Count of cancelled bookings this month |
| Average nights | Average of `nights` field across last 5 bookings |

**Recent bookings table**: Last 5 bookings with status badge, guest, property, dates, and total.

**App embed status check**: The loader fetches the merchant's active theme via the Shopify REST API (`GET /admin/api/{version}/themes.json`) and checks whether the Rentfic app embed block is enabled in the theme settings. If not enabled, shows an activation banner with a deep link to the theme editor.

**Plan card**: Shows the current plan, apartment count vs. limit, and upgrade prompt if on free plan.

---

## 11. Shared Components

### `PlanCard` (`app/components/PlanCard.jsx`)

Reusable plan upgrade card used across multiple pages (Dashboard, Apartments, Notifications) when the current plan does not include a feature.

Props:
- `plan` — current plan name
- `feature` — description of the locked feature
- `upgradeUrl` — link to `/app/subscribtion`

### `TimezoneSelect` (`app/components/TimezoneSelect.jsx`)

A searchable dropdown of IANA timezones, used in the Global Settings page. Renders using Shopify Polaris `Select` with a filtered list based on user input.
