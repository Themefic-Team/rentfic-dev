# 05 — Rentals
**Last Updated:** 2026-10-05

> Routes: `app/routes/app.apartments._index.jsx`, `app/routes/app.apartments.$id.jsx` | Menu: Rentals

## Rentals List (`app.apartments._index.jsx`)

### Features
- Lists all rental bookings for the shop, sorted newest first.
- Pagination: 10 per page, client-side (all loaded at once, sliced in the component).
- Search: filters by name or product title (client-side).
- **Duplicate**: copies a rental with `(Copy)` suffix. Checks plan limit before duplicating.
- **Delete**: removes the rental and all its bookings from DB.
- **Export iCal**: links to `/api/export/ical/:apartmentId`.
- **Product image + link**: fetched from Shopify Admin API (batch query with per-product aliases).

### Plan Limit Enforcement
- If `listingLimit` is reached, the "Add Rental" button is replaced with an upgrade prompt.
- Duplicate also checks the limit server-side in the action.

---

## Rental Edit Page (`app.apartments.$id.jsx`)

Single page for creating or editing a rental. All settings are stored in `Apartment.settings` (JSON blob) except `name`, `status`, `pricePerNight`, and `productId`.

### Section 1 — Linked Product
- The Shopify product linked to this rental.
- Used for checkout (customer pays via the product).
- Product details are hidden on the booking widget (only price matters).
- "View Live" button opens the product's storefront URL.
- **Export iCal** button is on this page header.

### Section 2 — Booking Settings

#### Rental Category
Selects what type of rentable item this is. Controls which fields are shown below.

| Category | Key | Price Unit | Shows Property Fields | Shows Guest Fields |
|---|---|---|---|---|
| Property | `property` | per night | ✅ | ✅ |
| Equipment | `equipment` | per day | ❌ | ❌ |
| Vehicle | `vehicle` | per day | ❌ | ❌ |
| Other | `other` | per booking | ❌ | ❌ |

Field stored as: `settings.listingType`

#### Booking Type
Controls how the date picker behaves on the storefront widget.

| Type | Key | Use Case |
|---|---|---|
| Single | `single` | One specific date (e.g. equipment rental) |
| Range | `range` | Check-in + Check-out (standard stays) |
| Multiple | `multiple` | Multi-day, non-contiguous dates |

Field stored as: `settings.bookingType`

#### Price Configuration
- **Price per Night/Day** (`pricePerNight` on model — top-level column)
- **Additional Fees** (`settings.additionalFees` — array of fee objects)
  - Each fee: `{ name, type: "flat"|"percent", amount, applyPer: "booking"|"night" }`
- **Conditional Discounts** (`settings.conditionalDiscounts` — array)
  - Each discount: `{ condition: "minDays"|"minTotal"|"minQty", conditionValue, discountType: "flat"|"percent", discountValue, applyMode: "once"|"each" }`
- **Weekend Pricing** (`settings.weekendPricing`): flat or percent surcharge for Sat/Sun.
- **Season Pricing** (`settings.seasonPricing` — array): date-range-based price overrides.

#### Calendar & Availability
- **Calendar Start/End Date**: restrict bookable date range (`settings.calendarStartDate`, `settings.calendarEndDate`)
- **Min/Max Stay** (`settings.minDays`, `settings.maxDays`)
- **Check-in / Check-out Times** (`settings.checkInTime`, `settings.checkOutTime`)
- **Weekly Availability** (`settings.weeklyAvailability`): per-day open/close times. Default: all days 00:00–23:59.
- **Blocked Dates** (`settings.blockedDates` — array of `YYYY-MM-DD` strings)
- **Booking Lead Time** (`settings.minLeadTime`): minimum days in advance for a booking.
- **Buffer Between Bookings** (`settings.bufferDays`): days blocked after each checkout.

#### Property-Specific Fields (shown when `listingType = property`)
- **Max Guests**: adults, children, infants (`settings.maxAdults`, `settings.maxChildren`, `settings.maxInfants`)
- **Min Adults** (`settings.minAdults`)
- **Amenities** (`settings.amenities` — array of strings). Pre-suggested list per category.
- **Description** (`settings.description`)

### Section 3 — Booking Calendar (tab)
- Embedded read-only calendar showing all bookings for this rental.
- Navigable by month via URL query param `?month=YYYY-MM`.

### Save Behaviour
- Uses Shopify App Bridge `SaveBar` for unsaved-changes detection.
- On submit, all fields are serialised into `FormData` and POST'd to the action.
- The action stores everything back to the DB. Returns `{ success: true }`.
- A Shopify toast notification confirms the save.
