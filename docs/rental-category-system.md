# 📋 Rentfic — Rental Category System: Working Process Docs

> **Last Updated:** 2026-09-27  
> **Status:** Active — Priorities 1 & 2 already fixed (see section 6)

---

## 1. Architecture Overview

```
Shopify Admin App (React Router)
    └── app/routes/app.apartments.$id.jsx  ← Admin edit page (all settings)
            │
            ▼ saves to PostgreSQL
    prisma/apartment.settings (JSON blob)
            │
            ▼ served by
    app/routes/api.proxy.apartment.$productId.jsx  ← Proxy API endpoint
            │
            ▼ consumed by
    extensions/rentfic/assets/rentfic-booking.js  ← Storefront widget (JS)
```

---

## 2. The 4 Rental Categories

| Key | Label | Description | Price Unit |
|---|---|---|---|
| `property` | Property | Apartment, villa, house, room | per night |
| `equipment` | Equipment | Tools, cameras, sports gear | per day |
| `vehicle` | Vehicle | Car, scooter, bike, RV | per day |
| `other` | Other | Any other rentable item | per booking |

The selected category is stored as `settings.listingType` in the database (PostgreSQL `Apartment.settings` JSON blob).

---

## 3. Admin UI — What Changes Per Category

### 3a. Booking Settings Section

| Field | property | equipment | vehicle | other |
|---|---|---|---|---|
| Listing Name placeholder | "Ocean View Suite" | "Canon R5 Camera" | "Red Tesla Model 3" | "Beach Chairs" |
| Description placeholder | "Describe the apartment..." | "Describe equipment, specs..." | "Describe the vehicle, mileage..." | "Describe this rental..." |
| Max Adults | ✅ Shown | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| Max Children | ✅ Shown | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| Max Infants | ✅ Shown | ❌ Hidden | ❌ Hidden | ❌ Hidden |

These are controlled by the `showGuestFields` flag in the `LISTING_TYPES` constant at the top of `app.apartments.$id.jsx`.

### 3b. Availability Section

| Field | property | equipment | vehicle | other |
|---|---|---|---|---|
| Time field 1 label | "Check-in Time" | "Pickup Time" | "Pickup Time" | "Pickup Time" |
| Time field 2 label | "Check-out Time" | "Return Time" | "Return Time" | "Return Time" |
| Quantity Selector toggle | ❌ Hidden (uses Property Details toggle) | ✅ Shown | ✅ Shown | ✅ Shown |

### 3c. Property Details Section *(only visible when `property` is selected)*

- Bedrooms, Bathrooms, Max Guests
- Track Stock Quantity toggle + Stock Quantity input
- Address, City, Country (full address block)

### 3d. Stock & Capacity Section *(all categories)*

| Field | property | equipment | vehicle | other |
|---|---|---|---|---|
| Price label | "Price per Night ($)" | "Price per Day ($)" | "Price per Day ($)" | "Price per Booking ($)" |
| Location / Address | ❌ Hidden (uses Property Details) | ✅ Shown | ✅ Shown | ✅ Shown |
| Passenger Capacity (Seats) | ❌ Hidden | ❌ Hidden | ✅ Shown | ❌ Hidden |

---

## 4. Storefront Widget — Label Logic Per Category

The widget (`rentfic-booking.js`) receives `listingType` from the proxy API and switches labels dynamically.

### 4a. Price Header (`_renderHeader`)

| Category | Price Label | Duration Word |
|---|---|---|
| `property` | `$XX / night` | night / nights |
| `equipment` | `$XX / day` | day / days |
| `vehicle` | `$XX / day` | day / days |
| `other` | `$XX / booking` | booking / bookings |

### 4b. Info Strip (`_renderInfoStrip`)

| Field | property | equipment | vehicle | other |
|---|---|---|---|---|
| Bedrooms | ✅ Shown | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| Bathrooms | ✅ Shown | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| Max capacity label | "guests" | "guests" | **"seats"** | "guests" |
| Time-in label | "Check-in" | "Pickup" | "Pickup" | "Pickup" |
| Time-out label | "Check-out" | "Return" | "Return" | "Return" |
| Min duration word | "nights" | "days" | "days" | "bookings" |

### 4c. Guest Selector (`_renderGuestSelector`)

| Category | Shown | Section Title | Row Labels |
|---|---|---|---|
| `property` | ✅ Yes | "Guests" | Adults / Children / Infants |
| `vehicle` | ✅ Yes | "Passengers" | Seats |
| `equipment` | ❌ No | — | — |
| `other` | ❌ No | — | — |

### 4d. Price Summary (`_renderSummary`) — ✅ Fixed

The price breakdown now dynamically shows the correct unit word per category:

```
property  →  "1 night × $XX.00"
vehicle   →  "1 day × $XX.00"
equipment →  "1 day × $XX.00"
other     →  "1 booking × $XX.00"
```

Additional fee label also updated:
- `property` → `(per night)`
- `vehicle` / `equipment` → `(per day)`
- `other` → `(per booking)`

### 4e. Cart Line Item Properties (`_reserve`)

These are the property keys stored on the Shopify order line item:

| Property Key | property | vehicle | equipment / other |
|---|---|---|---|
| Start date | `Check-in` | `Pickup` | `Pickup` |
| End date | `Check-out` | `Return` | `Return` |
| Duration | `Nights` | `Days` | `Days` |
| Guest info | Adults, Children, Infants, Total Guests | Passengers | — |
| Common | `Units`, `Total Price`, `_booking_id` | same | same |

---

## 5. Data Flow — Step by Step

```
MERCHANT SIDE
─────────────────────────────────────────────────────
1.  Merchant opens Admin → Edit Rental page
2.  Selects Rental Category (property / vehicle / equipment / other)
3.  Fills in category-specific fields (price, availability, amenities, etc.)
4.  Clicks Save → POST /app/apartments/:id
5.  Action handler:
      a. Saves top-level columns (name, status, pricePerNight) to DB
      b. Saves all other settings to apartment.settings JSON blob
      c. Syncs variant price to Shopify via GraphQL
      d. Sets rentfic.is_apartment metafield on the product

CUSTOMER SIDE
─────────────────────────────────────────────────────
6.  Customer visits product page on storefront
7.  rentfic-booking.js boots on DOMContentLoaded
8.  Checks: product.metafields.rentfic.is_apartment === 'true'
9.  Extracts product ID from page URL
10. Fetches: /apps/rentfic/apartment/:productId  (app proxy endpoint)
11. Proxy reads apartment record from PostgreSQL
12. Returns: apartment settings + shopSettings JSON

13. Widget renders based on listingType:
      - Dynamic price unit label (night / day / booking)
      - Dynamic info strip (check-in vs pickup labels)
      - Dynamic guest/passenger selector
      - Dynamic calendar with blocked + discounted dates

14. Customer selects dates
15. Widget calculates: base price + fees + discounts + deposit
16. Customer clicks "Book Now"

17. Widget POSTs to /apps/rentfic/booking:
      { apartmentId, startDate, endDate, nights, guests, quantity }
18. Server validates and creates Booking record (status: "pending")
19. Server recalculates total price authoritatively
20. Server updates Shopify variant price to the booking total

21. Widget adds product to Shopify cart with line item properties:
      Check-in / Pickup, Check-out / Return, Nights / Days, etc.
22. (If deposit) Widget also adds deposit variant to cart

23. Widget resets variant price (fire-and-forget)
24. Customer redirects to checkout or cart

POST-CHECKOUT
─────────────────────────────────────────────────────
25. Customer completes checkout → Shopify order created
26. webhooks.orders.create.jsx fires
27. Webhook matches order to booking via _booking_id line item property
28. Booking status updated to "confirmed"
29. Notification email sent to customer + merchant (if configured)
```

---

## 6. Known Issues & Fix Status

| # | Issue | Priority | Status |
|---|---|---|---|
| 1 | `night` hardcoded in price summary for all categories | 🔴 Critical | ✅ **Fixed** |
| 2 | `quantityEnabled` toggle duplicated for property | 🔴 Critical | ✅ **Fixed** |
| 3 | No vehicle-specific fields (fuel, mileage, license, transmission) | 🟠 Missing Feature | ⏳ Pending |
| 4 | No equipment-specific fields (condition, unit count) | 🟠 Missing Feature | ⏳ Pending |
| 5 | `maxGuests` vs `maxAdults+Children` not validated | 🟠 Data Integrity | ⏳ Pending |
| 6 | Weekly availability open/close time slots not editable in UI | 🟡 UX Bug | ⏳ Pending |
| 7 | `listingType` not shown on booking list/detail pages | 🟡 UX Gap | ⏳ Pending |

### Fix Detail — Issue #3: Missing Vehicle Fields
Add to **Stock & Capacity** section (`app.apartments.$id.jsx`) when `listingType === 'vehicle'`:
- Transmission Type: `Automatic` / `Manual` (select)
- Fuel Policy: `Full-to-Full` / `Pre-paid` / `Included` (select)
- Mileage Limit: toggle + number input (km/miles)
- Driver's License Required: toggle

> Stored inside `settings` JSON blob — **no DB migration needed.**

### Fix Detail — Issue #4: Missing Equipment Fields
Add to **Stock & Capacity** section when `listingType === 'equipment'`:
- Condition: `New` / `Good` / `Fair` / `For Parts` (select)
- Total Units in Inventory: number input (distinct from `stockQuantity`)

### Fix Detail — Issue #6: Weekly Availability Time Slots
In `app.apartments.$id.jsx` lines ~1041–1058, add `<input type="time">` fields for `open` and `close` per day when that day's toggle is `enabled`. The state (`weeklyAvailability`) already supports it — only the UI is missing.

---

## 7. File Reference Map

| Purpose | File Path |
|---|---|
| Admin edit page (all settings) | `app/routes/app.apartments.$id.jsx` |
| Admin rental list | `app/routes/app.apartments._index.jsx` |
| Proxy API (widget data source) | `app/routes/api.proxy.apartment.$productId.jsx` |
| Booking API (create booking) | `app/routes/api.proxy.booking.jsx` |
| Price reset API | `app/routes/api.proxy.price-reset.jsx` |
| Storefront widget JS | `extensions/rentfic/assets/rentfic-booking.js` |
| Widget CSS | `extensions/rentfic/assets/rentfic-booking.css` |
| Theme app embed block | `extensions/rentfic/blocks/app_embed.liquid` |
| Database schema | `prisma/schema.prisma` |
| Booking admin detail | `app/routes/app.booking.$id.jsx` |
| Booking admin list | `app/routes/app.booking._index.jsx` |
| Order webhook handler | `app/routes/webhooks.orders.create.jsx` |
| Global settings | `app/routes/app.settings.jsx` |
| Plan limits | `app/plans.server.js` |

---

## 8. Adding a New Rental Category

To add a new category (e.g., `experience`):

1. **`app.apartments.$id.jsx`** — Add to `LISTING_TYPES` array:
   ```js
   {
     key: "experience",
     label: "Experience",
     icon: SomeIcon,
     desc: "Tours, classes, activities",
     priceUnit: "session",
     priceLabel: "Price per Session ($)",
     showPropertyFields: false,
     showGuestFields: true,   // show Adults/Children/Infants
   }
   ```

2. **`AMENITY_SUGGESTIONS`** — Add an `experience` key with relevant suggestions.

3. **`rentfic-booking.js` — `_renderHeader`** — Add price unit logic:
   ```js
   : lt === 'experience' ? 'session'
   ```

4. **`rentfic-booking.js` — `_renderInfoStrip`** — Add duration unit:
   ```js
   : lt === 'experience' ? 'sessions'
   ```

5. **`rentfic-booking.js` — `_renderSummary`** — Add unit singular/plural:
   ```js
   const unitSingular = ... : lt === 'experience' ? 'session' : 'night';
   ```

6. **`rentfic-booking.js` — `_renderGuestSelector`** — Include `experience` in the guest selector condition:
   ```js
   if (lt !== 'property' && lt !== 'experience' && lt !== 'vehicle') return '';
   ```

7. **`api.proxy.apartment.$productId.jsx`** — No changes needed (returns `listingType` as-is).

8. **No DB migration needed** — `listingType` is stored in the JSON blob.
