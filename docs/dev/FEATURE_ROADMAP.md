# Rentfic — Current Features & Future Roadmap

> **Current features verified against**: `app/routes/`, `prisma/schema.prisma`, `extensions/rentfic/`, `app/plans.server.js`
> **Future features researched from**: IzyRent, RentBase, BookThatApp (BTA), Cowlendar, Sesami, RentalFlow, Booqable, Product Rentals Pro competitor analysis (September 2026)

---

## Table of Contents

1. [Current Features](#current-features)
2. [Current Plan Breakdown](#current-plan-breakdown)
3. [Competitor Feature Benchmark](#competitor-feature-benchmark)
4. [Future Feature Roadmap](#future-feature-roadmap)

---

## Current Features

### Storefront (Customer-Facing Widget)

| # | Feature | Detail |
|---|---|---|
| ✅ | **Date-range booking (nightly)** | Check-in + check-out date picker with min/max night enforcement |
| ✅ | **Single-date booking** | One date picker for same-day or single-day rentals |
| ✅ | **Multi-date booking** | Customer selects multiple individual dates (non-contiguous) |
| ✅ | **Live price breakdown** | Base price, additional fees, conditional discounts, and deposit shown before checkout |
| ✅ | **Guest picker** | Adults, children, infants — with per-category max limits |
| ✅ | **Quantity / stock selector** | Book multiple units of the same listing with stock-level enforcement |
| ✅ | **Blocked dates** | Per-apartment and global shop-level date blocking |
| ✅ | **Weekly availability schedule** | Per-day open/close hours (e.g. closed on Sundays) |
| ✅ | **Additional fees** | Flat or percentage fees, per-booking or per-night (e.g. cleaning fee, service fee) |
| ✅ | **Conditional discounts** | Rule-based discounts: min nights, min total, min guests |
| ✅ | **Discounted dates** | Per-date price overrides |
| ✅ | **Deposit collection** | Percentage or fixed deposit at checkout; full balance collected separately |
| ✅ | **Deposit product variant** | Auto-creates and manages a "Deposit" Shopify product variant |
| ✅ | **Native Shopify checkout** | Booking flows directly through Shopify's checkout — no external payment gateway |
| ✅ | **Widget localization** | Built-in translations: English, French, German, Spanish, Arabic (RTL) |
| ✅ | **Auto language detection** | `navigator.language` fallback with merchant override |
| ✅ | **Property details display** | Bedrooms, bathrooms, address, city, country, amenities shown in widget |
| ✅ | **Check-in/check-out times** | Displayed in the widget (e.g. "Check-in: 3:00 PM") |
| ✅ | **Calendar date range constraints** | Set earliest available date and latest available date per apartment |
| ✅ | **Theme editor customization** | Primary color and book button text configurable in Shopify theme editor |
| ✅ | **Native add-to-cart hiding** | Automatically hides Shopify's default add-to-cart and buy buttons on apartment pages |
| ✅ | **Availability conflict check** | Prevents double-booking on date ranges (and stock-aware for multi-unit listings) |
| ✅ | **Price reset after abandonment** | Resets variant price to `pricePerNight` if customer cancels the booking |
| ✅ | **`rentfic:ready` DOM event** | Fires after widget initializes — allows custom JS integrations |

---

### Admin Panel (Merchant-Facing)

#### Dashboard
| # | Feature | Detail |
|---|---|---|
| ✅ | **KPI summary cards** | Total bookings, active apartments, monthly revenue, new bookings, cancellations |
| ✅ | **Recent bookings table** | Last 5 bookings with status, guest, property, dates, total |
| ✅ | **Average nights metric** | Calculated from recent booking data |
| ✅ | **App embed status check** | Detects if the Rentfic embed is activated in the live theme |
| ✅ | **Embed activation deep link** | One-click link to open Shopify theme editor at the Rentfic block |
| ✅ | **Plan & limit display** | Shows current plan, apartment count vs. plan limit |

#### Apartment Management
| # | Feature | Detail |
|---|---|---|
| ✅ | **Apartment list** | Searchable, sortable, paginated list (10/page) |
| ✅ | **Create apartment** | Shopify resource picker → link product → full settings form |
| ✅ | **Edit apartment** | Full settings editor with App Bridge SaveBar (unsaved changes prompt) |
| ✅ | **Delete apartment** | Deletes record + writes `rentfic.is_apartment = "false"` metafield to Shopify product |
| ✅ | **Duplicate apartment** | Deep-copy settings, creates as draft status |
| ✅ | **Bulk activate / deactivate / delete** | Multi-select with bulk action dropdown |
| ✅ | **Per-apartment booking type** | Single / Nightly / Multi-date |
| ✅ | **Per-apartment pricing** | `pricePerNight`, additional fees, conditional discounts |
| ✅ | **Per-apartment deposit** | Enable deposit, set as % or fixed amount |
| ✅ | **Per-apartment availability** | Weekly schedule (per day), blocked dates, discounted dates |
| ✅ | **Per-apartment constraints** | Min/max nights, max adults/children/infants/guests |
| ✅ | **Per-apartment property details** | Bedrooms, bathrooms, address, city, country, amenities |
| ✅ | **iCal export per apartment** | Export confirmed bookings as `.ics` calendar file |
| ✅ | **Plan limit enforcement** | Cannot create more apartments than plan allows |
| ✅ | **Shopify variant sync** | Auto-sets `pricePerNight` on product variant, sets `inventoryPolicy: CONTINUE` |
| ✅ | **Auto-balance invoice** | Per-apartment toggle: auto-create draft order when booking is confirmed |

#### Booking Management
| # | Feature | Detail |
|---|---|---|
| ✅ | **Bookings list** | Full table with search, status filter, tab filter (All/Open/Complete/Cancelled) |
| ✅ | **Booking detail view** | Guest info, dates, pricing, order link, balance status |
| ✅ | **Manual booking creation** | Admin-side form to create a booking without storefront checkout |
| ✅ | **Edit booking** | Modify guest name, email, dates, prices, notes |
| ✅ | **Cancel booking** | Updates status + sends cancellation emails to guest and owner |
| ✅ | **Delete booking** | Hard delete from database |
| ✅ | **Status management** | Set to Pending / Confirmed / Completed / Cancelled |
| ✅ | **Bulk status change** | Change status for multiple bookings at once |
| ✅ | **Balance invoice** | Create Shopify Draft Order for remaining balance (totalPrice − depositAmount) |
| ✅ | **Send invoice email** | Sends Shopify draft order invoice email to customer |
| ✅ | **Balance status tracking** | Pending → Invoiced → Paid |
| ✅ | **Order linking** | Links bookings to Shopify orders via `_booking_id` line item property |
| ✅ | **Unlinked booking sync** | Automatic reconciliation of bookings not yet linked to orders |
| ✅ | **Order tag backfill** | Tags all linked Shopify orders with "rentfic" label |
| ✅ | **Booking calendar view** | Monthly grid view of all bookings, color-coded by apartment |
| ✅ | **CSV export** | Export all bookings as a UTF-8 CSV file |
| ✅ | **iCal export (all)** | Export all apartments' confirmed bookings as `.ics` |

#### Notifications
| # | Feature | Detail |
|---|---|---|
| ✅ | **8 email notification types** | Booking Confirmation, New Booking Alert (owner), Booking Reminder, Check-in Day, Check-out Reminder, Cancellation (guest), Cancellation (owner), Review Request |
| ✅ | **Per-template enable/disable** | Toggle each notification type on or off |
| ✅ | **Custom subject & body** | Edit subject line and body with `{{placeholder}}` variable support |
| ✅ | **Configurable reminder timing** | Booking Reminder: X days before check-in; Review Request: X days after check-out |
| ✅ | **9 template variables** | `{{date}}`, `{{start}}`, `{{end}}`, `{{product.name}}`, `{{product.url}}`, `{{order.name}}`, `{{order.note}}`, `{{customer.firstName}}`, `{{customer.lastName}}` |
| ✅ | **SMTP configuration** | Merchant's own SMTP server (host, port, user, pass, encryption, from name/email) |
| ✅ | **App-level SMTP fallback** | App-level SMTP via environment variables |
| ✅ | **Ethereal test inbox** | Development fallback when no SMTP is configured |
| ✅ | **Test email sender** | Send a test email to any address with dummy data |
| ✅ | **Email deduplication** | `NotificationLog` prevents cron-triggered duplicates |
| ✅ | **Cron endpoint** | `POST /api/reminders` for scheduled sends (requires `CRON_SECRET` header) |

#### Settings
| # | Feature | Detail |
|---|---|---|
| ✅ | **Timezone selector** | IANA timezone searchable dropdown |
| ✅ | **Time format** | 12-hour or 24-hour |
| ✅ | **Language** | Automatic or manual widget language selection |
| ✅ | **Redirect after cart** | Send customer to cart or checkout after booking |
| ✅ | **Calendar display** | Always open or collapsed by default |
| ✅ | **Global blocked dates** | Block dates across all apartments |
| ✅ | **Global deposit settings** | Default deposit type and value across all apartments |

#### Analytics (Business plan only)
| # | Feature | Detail |
|---|---|---|
| ✅ | **Revenue by month** | Bar chart of revenue (confirmed + completed bookings), last 12 months |
| ✅ | **Booking count by month** | Booking count per month |
| ✅ | **Booking status breakdown** | Pending / Confirmed / Completed / Cancelled counts (all time) |
| ✅ | **Top apartments by revenue** | Ranked list of highest-earning listings |
| ✅ | **Top apartments by booking count** | Ranked list of most-booked listings |
| ✅ | **Average nights** | Average stay length across all bookings |

#### Billing
| # | Feature | Detail |
|---|---|---|
| ✅ | **4 billing plans** | Free, Pro ($19/mo), Pro Yearly ($182/yr), Business ($49/mo), Business Yearly ($470/yr) |
| ✅ | **7-day free trial** | All paid plans |
| ✅ | **Shopify native billing** | Charged through Shopify — no separate payment gateway |
| ✅ | **Plan-gated features** | Apartment limit and analytics gated by plan |
| ✅ | **Subscription management** | Upgrade, downgrade, cancel in-app |
| ✅ | **Priority support (Business)** | Crisp chat widget injected for Business plan merchants |

---

## Current Plan Breakdown

| Feature | Free | Pro | Business |
|---|---|---|---|
| Price | $0 | $19/mo · $182/yr | $49/mo · $470/yr |
| Apartments | 1 | Unlimited | Unlimited |
| Booking calendar | ✅ | ✅ | ✅ |
| Email notifications | ✅ | ✅ | ✅ |
| Custom notification templates | ✅ | ✅ | ✅ |
| SMTP email delivery | ✅ | ✅ | ✅ |
| CSV + iCal export | ✅ | ✅ | ✅ |
| Deposit collection | ✅ | ✅ | ✅ |
| Balance invoicing | ✅ | ✅ | ✅ |
| Analytics & reports | ❌ | ❌ | ✅ |
| Priority support (Crisp) | ❌ | ❌ | ✅ |

---

## Competitor Feature Benchmark

How Rentfic compares to the top competitors today:

| Feature | Rentfic | IzyRent | BookThatApp | RentBase | Cowlendar | Booqable |
|---|---|---|---|---|---|---|
| Nightly / date-range booking | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-date booking | ✅ | ✅ | ✅ | — | — | — |
| Deposit collection | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Additional fees | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Conditional discounts | ✅ | — | ✅ | — | — | ✅ |
| Guest picker | ✅ | ✅ | ✅ | — | — | — |
| Stock / multi-unit | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Email notifications (8 types) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom SMTP | ✅ | — | — | ✅ | — | — |
| Admin calendar view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manual booking creation | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| CSV export | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| iCal export | ✅ | ✅ | ✅ | — | ✅ | — |
| Analytics dashboard | ✅ | — | ✅ | — | — | ✅ |
| Balance invoicing (draft orders) | ✅ | — | — | ✅ | — | ✅ |
| Widget i18n (5 languages) | ✅ | ✅ | — | — | ✅ | — |
| iCal **import** (Airbnb/VRBO sync) | ❌ | ✅ | ✅ | — | ✅ | — |
| Two-way Google Calendar sync | ❌ | ✅ | ✅ | — | ✅ | — |
| E-signature / rental contracts | ❌ | ❌ | — | ✅ | — | — |
| Buffer / turnaround time between bookings | ❌ | — | ✅ | ✅ | — | ✅ |
| Seasonal / dynamic pricing | ❌ | ✅ | ✅ | — | — | ✅ |
| SMS notifications | ❌ | — | — | — | ✅ | — |
| Abandoned booking recovery | ❌ | — | — | — | — | — |
| Custom booking form fields | ❌ | — | ✅ | — | ✅ | ✅ |
| Damage deposit / security refund | ❌ | ✅ | — | ✅ | — | ✅ |
| Recurring / subscription bookings | ❌ | — | ✅ | — | — | — |
| Photo gallery in widget | ❌ | — | — | — | — | ✅ |
| Map / location embed | ❌ | — | — | ✅ | — | — |
| Maintenance / turnaround blocking | ❌ | — | — | ✅ | — | ✅ |
| Webhook / API for integrations | ❌ | — | ✅ | — | — | ✅ |

---

## Future Feature Roadmap

Features are grouped by priority tier based on competitive gap, implementation complexity, and merchant impact.

---

### 🔴 Priority 1 — High Impact / Competitive Gaps

These features are standard in competitors and are most likely to be deal-breakers for merchants evaluating Rentfic.

---

#### 1.1 iCal Import (External Calendar Sync)
**Competitive gap**: IzyRent, Cowlendar, BookThatApp all offer this.
**Merchant pain point**: Hosts listing on Airbnb/VRBO/Booking.com cannot prevent double bookings without this.

- Merchant pastes an Airbnb/VRBO iCal feed URL per apartment.
- App fetches the feed on a schedule (e.g. every hour via cron).
- Parses `VEVENT` blocks and writes them as `"blocked"` entries in `Apartment.settings.blockedDates`.
- Widget treats imported blocked dates identically to manually blocked dates.

**DB change**: Add `icalImports: [{ url, lastSyncedAt, syncedDates[] }]` to `Apartment.settings`.

---

#### 1.2 Buffer / Turnaround Time Between Bookings
**Competitive gap**: BookThatApp, RentBase, Booqable, Product Rentals Pro all have this.
**Merchant pain point**: Hosts need cleaning/preparation time between checkout and the next check-in.

- Per-apartment setting: "Buffer days after checkout" (e.g. 1 day).
- Conflict check in `api.proxy.booking.jsx` expands blocked range by buffer days.
- Admin calendar shows buffer days visually as a lighter "blocked" color.

**DB change**: Add `bufferDays: 1` to `Apartment.settings`.

---

#### 1.3 Seasonal / Dynamic Pricing
**Competitive gap**: IzyRent, BookThatApp, Booqable all support this.
**Merchant pain point**: Hosts need higher prices for peak seasons (summer, holidays) and lower for off-peak.

- Admin UI: date-range + custom price table (e.g. "Dec 20–Jan 5: $250/night").
- Widget price calculation reads seasonal price for selected dates.
- Supports min-night overrides per season (e.g. "5-night minimum in August").

**DB change**: Add `seasonalPricing: [{ startDate, endDate, pricePerNight, minDays }]` to `Apartment.settings`.

---

#### 1.4 Custom Booking Form Fields
**Competitive gap**: BookThatApp, Cowlendar both support this.
**Merchant pain point**: Hosts need to collect additional info at booking time (e.g. arrival time, special requests, ID number, vehicle plate for parking).

- Admin UI: Add custom fields (text, select, checkbox) per apartment.
- Widget renders the fields before the "Reserve Now" button.
- Field values stored in `Booking.lineItemProperties` and shown in admin detail view.

---

#### 1.5 SMS Notifications
**Competitive gap**: Cowlendar, Sesami both offer SMS.
**Merchant pain point**: Email open rates are low; SMS is significantly more effective for booking reminders.

- Integrate with Twilio or similar SMS provider.
- Per-template: enable SMS alongside or instead of email.
- Requires new `smsProvider`, `smsApiKey`, `smsFrom` fields in `NotificationConfig`.

---

### 🟡 Priority 2 — Medium Impact / Differentiating Features

These features would meaningfully differentiate Rentfic from competitors and unlock new merchant segments.

---

#### 2.1 Two-Way Google Calendar Sync
**Competitive gap**: IzyRent, Cowlendar, BookThatApp all offer this.

- OAuth2 flow to connect merchant's Google Calendar.
- New confirmed bookings → push VEVENT to Google Calendar.
- New events added in Google Calendar → pull and block dates in Rentfic.
- Requires new `googleCalendarTokens` field in `Shop.settings`.

---

#### 2.2 E-Signature Rental Agreements / Contracts
**Competitive gap**: RentBase Pro plan includes this; no other Shopify app does it well.
**Merchant pain point**: Property managers and equipment rental businesses require signed agreements before a rental can proceed.

- Per-apartment: upload/write a rental agreement template (with `{{placeholders}}`).
- After checkout, guest receives a signing link (integrate with HelloSign/DocuSign API or a lightweight in-app signature pad).
- Signed PDF stored and linked to `Booking.signedContractUrl`.
- `Booking.contractStatus`: `"pending"` → `"signed"`.

**DB change**: Add `signedContractUrl`, `contractStatus` to `Booking` model.

---

#### 2.3 Damage Deposit / Security Deposit Refund Management
**Competitive gap**: IzyRent, RentBase, Booqable all handle this.
**Merchant pain point**: Separating a refundable security deposit from the non-refundable booking total is operationally important.

- Distinguish between a **booking deposit** (partial payment toward total, currently implemented) and a **security deposit** (refundable, held as collateral).
- Admin can mark a security deposit as "returned" or "forfeited" per booking.
- Track `securityDepositAmount`, `securityDepositStatus: "held" | "returned" | "forfeited"`.

**DB change**: Add `securityDepositAmount`, `securityDepositStatus` to `Booking` model.

---

#### 2.4 Abandoned Booking Recovery
**No direct competitor offers this well** — a real differentiator.
**Merchant pain point**: Many customers start but don't complete a booking.

- Detect when `Booking.status === "pending"` and `updatedAt` is >X hours old without an associated order.
- Trigger a "You left a booking incomplete" email (`abandonedBooking` notification type).
- Include a direct link back to the product page with pre-filled dates.

**DB change**: Add `abandonedBooking` to `DEFAULT_TEMPLATES` and `NotificationLog`.

---

#### 2.5 Booking Page (Public Booking Confirmation URL)
**Merchant pain point**: Customers have no self-service way to view their booking details after checkout.

- Generate a public shareable booking confirmation URL (e.g. `/apps/rentfic/booking/:id?token=...`).
- Displays booking summary, check-in/out dates, property details.
- Include a cancellation request button (if cancellations are allowed within a window).

---

#### 2.6 Klaviyo / Mailchimp Integration
**Competitive gap**: Sesami offers Klaviyo integration.

- On booking confirmation, push booking data to Klaviyo/Mailchimp as a custom event.
- Enables merchants to use advanced marketing automation outside of Rentfic's email system.

---

### 🟢 Priority 3 — Nice to Have / Long-Term

These features improve depth and enterprise appeal but are not urgent competitive gaps.

---

#### 3.1 Recurring / Subscription Bookings
- Allow customers to book the same property on a recurring schedule (weekly, monthly).
- Relevant for long-term rentals, co-working spaces, and storage units.

#### 3.2 Photo Gallery in Widget
- Merchant uploads or links photos per apartment.
- Widget shows a thumbnail strip or lightbox gallery above the booking calendar.
- DB change: `Apartment.settings.images` already exists in the schema — just needs UI rendering in the widget.

#### 3.3 Map / Location Embed
- Per-apartment: enter Google Maps embed URL or lat/lng coordinates.
- Widget renders an interactive map below property details.

#### 3.4 Reviews / Ratings Display
- The theme extension already has a `star_rating.liquid` block.
- Allow merchants to paste a Shopify product review widget or connect Judge.me / Okendo.

#### 3.5 Multi-Language Admin Panel
- The storefront widget already supports 5 languages.
- Extend i18n to the admin panel itself (currently English only).

#### 3.6 Maintenance / Turnaround Blocking
- A distinct "maintenance" block type (separate from a customer-facing blocked date).
- Admin can mark specific date ranges as "under maintenance" per apartment.
- These are hidden from the widget (not shown as "unavailable" — just blocked).

#### 3.7 Webhook / Developer API
- Expose a developer-facing webhook system so merchants can integrate Rentfic booking events (`booking.created`, `booking.confirmed`, `booking.cancelled`) with external tools (Zapier, Make.com, custom backends).

#### 3.8 Booking Waitlist
- If a customer tries to book unavailable dates, offer a "Join Waitlist" option.
- If a cancellation opens up those dates, notify waitlisted customers automatically.

#### 3.9 Coupon / Promo Code Support
- Allow merchants to create discount codes redeemable at the booking widget level (applied before the variant price is set).
- Separate from Shopify's native discount system (which runs at checkout and cannot be pre-applied to the variant price).

#### 3.10 Multi-Currency Display
- The widget currently shows prices in the shop's base currency.
- Show prices in the customer's local currency using Shopify Markets or exchange rate APIs.

---

## Summary Count

| Category | Count |
|---|---|
| Current features (total) | **90+** |
| Priority 1 future features | **5** |
| Priority 2 future features | **6** |
| Priority 3 future features | **10** |
| **Total planned features** | **21** |
