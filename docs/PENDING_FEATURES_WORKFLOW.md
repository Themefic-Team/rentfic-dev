# Rentfic — Pending Features Implementation Workflow

> This document covers **every pending/missing feature** identified in the feature audit.
> Each feature includes: what needs to be built, which files to create/edit, the exact implementation steps, and the data flow.

---

## Table of Contents

### 🔴 High Priority
1. ~~[Analytics & Reports Dashboard (Business Plan)](#1-analytics--reports-dashboard-business-plan)~~ ✅ **Completed**
2. ~~[Booking Cancellation Email — Auto-Trigger](#2-booking-cancellation-email--auto-trigger)~~ ✅ **Completed**
3. ~~[Manual Booking Creation (Admin)](#3-manual-booking-creation-admin)~~ ✅ **Completed**

### 🟡 Medium Priority
4. ~~[Real Billing History (Shopify Invoices)](#4-real-billing-history-shopify-invoices)~~ ✅ **Completed**
5. ~~[Yearly Billing API Integration](#5-yearly-billing-api-integration)~~ ✅ **Completed**
6. ~~[Booking Edit (Change Dates & Guest Info)](#6-booking-edit-change-dates--guest-info)~~ ✅ **Completed**
7. ~~[Calendar View of Bookings (Month/Week)](#7-calendar-view-of-bookings-monthweek)~~ ✅ **Completed**
8. ~~[Apartment Photo Uploads](#8-apartment-photo-uploads)~~ ✅ **Completed**
9. ~~[Discounted Dates Visual Highlight in Widget](#9-discounted-dates-visual-highlight-in-widget)~~ ✅ **Completed**
10. ~~[Amenities Display in Storefront Widget](#10-amenities-display-in-storefront-widget)~~ ✅ **Completed**
11. ~~[Map / Location Display in Widget](#11-map--location-display-in-widget)~~ ✅ **Completed**
12. ~~[Multi-Language Storefront Widget](#12-multi-language-storefront-widget)~~ ✅ **Completed**

### 🔵 Low Priority
13. ~~[iCal / Google Calendar Export & Sync](#13-ical--google-calendar-export--sync)~~ ✅ **Completed**
14. ~~[Bulk Booking Actions](#14-bulk-booking-actions)~~ ✅ **Completed**
15. ~~[Bulk Apartment Actions](#15-bulk-apartment-actions)~~ ✅ **Completed**
16. ~~[Apartment Duplication](#16-apartment-duplication)~~ ✅ **Completed**
17. ~~[Owner Cancellation Email](#17-owner-cancellation-email)~~ ✅ **Completed**
18. ~~[Priority Support Widget (Business Plan)](#18-priority-support-widget-business-plan)~~ ✅ **Completed**
19. ~~[Export Bookings as CSV/PDF](#19-export-bookings-as-csvpdf)~~ ✅ **Completed**
20. ~~[Occupancy Rate Tracking](#20-occupancy-rate-tracking)~~ ✅ **Completed**
21. ~~[Admin Mobile Responsiveness](#21-admin-mobile-responsiveness)~~ ✅ **Completed**
22. ~~[Clean Up app.additional.jsx Placeholder](#22-clean-up-appaditionaljsx-placeholder)~~ ✅ **Completed**

---

## ~~1. Analytics & Reports Dashboard (Business Plan)~~ ✅ COMPLETED

### What's Missing
No route, no UI, no data aggregation. Only `analytics: true` flag in `plans.server.js`.

### Files to Create / Edit
| Action | File |
|---|---|
| **NEW** | `app/routes/app.analytics.jsx` |
| **EDIT** | `app/routes/app.jsx` (add nav link) |
| **EDIT** | `prisma/schema.prisma` (optional: add index for date-range queries) |

### Step-by-Step Implementation

**Step 1 — Add nav link** in `app/routes/app.jsx`:
```jsx
<s-link href="/app/analytics">Analytics</s-link>
```

**Step 2 — Create `app/routes/app.analytics.jsx`**

```
Loader:
  1. authenticate.admin(request) → get shop
  2. Check plan: if plan !== "business" → redirect("/app/subscribtion")
  3. Run aggregation queries:
     a. Revenue by month (last 12 months)
        prisma.booking.groupBy({
          by: ["createdAt"],   ← aggregate by month using raw query or JS post-processing
          where: { shop, status: { in: ["confirmed","completed"] } },
          _sum: { totalPrice: true }
        })
     b. Bookings by status (all time)
        prisma.booking.groupBy({ by: ["status"], _count: true })
     c. Occupancy rate per apartment
        For each apartment: count booked nights ÷ total available nights × 100
     d. Top apartments by revenue
        prisma.booking.groupBy({ by: ["apartmentId"], _sum: { totalPrice: true }, orderBy: ... })
     e. Average booking lead time (startDate - createdAt)
  4. Return all aggregated data

Component:
  - Revenue chart (bar chart — monthly revenue last 12 months)
  - Booking status breakdown (pie/donut chart)
  - Occupancy rate per apartment (horizontal bar)
  - Top apartments by revenue (table)
  - Average lead time stat card
```

**Step 3 — Add a charting library**
```bash
npm install recharts
```
Use `recharts` (`BarChart`, `PieChart`, `ResponsiveContainer`) — it's React-based and lightweight.

**Step 4 — Plan gate in loader**:
```js
const shopRecord = await prisma.shop.findUnique({ where: { shop } });
if (shopRecord?.plan !== "business") {
  return redirect("/app/subscribtion");
}
```

**Step 5 — Add export button** (links to the CSV export route — see Feature #19).

---

## ~~2. Booking Cancellation Email — Auto-Trigger~~ ✅ COMPLETED

### What's Missing
The `bookingCancelled` email template exists in the Notifications UI but is **never sent automatically**. Changing a booking's status to "cancelled" in the admin does not fire any email.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/app.booking.$id.jsx` (action) |
| **EDIT** | `app/routes/app.booking.jsx` (action, for bulk cancel if added) |

### Step-by-Step Implementation

**Step 1 — Edit the action in `app/routes/app.booking.$id.jsx`**:

Current action:
```js
await prisma.booking.update({ where: { id }, data: { status } });
return { success: true };
```

New action:
```js
const { session, admin } = await authenticate.admin(request);
const fd = await request.formData();
const status = fd.get("status");

// Fetch the booking before updating (need customerEmail + current status)
const booking = await prisma.booking.findFirst({
  where: { id: params.id, shop: session.shop },
});

await prisma.booking.update({
  where: { id: params.id, shop: session.shop },
  data: { status },
});

// Fire cancellation emails when status changes TO "cancelled"
if (status === "cancelled" && booking?.status !== "cancelled") {
  const { sendNotification } = await import("../email.server");

  const vars = buildVars(session.shop, booking);  // same helper as api.reminders.jsx

  // 1. Guest cancellation email
  if (booking.customerEmail) {
    await sendNotification(session.shop, "bookingCancelled", vars, {
      to: booking.customerEmail,
    });
  }

  // 2. Owner cancellation alert
  const shopRecord = await prisma.shop.findUnique({
    where: { shop: session.shop },
    select: { email: true },
  });
  if (shopRecord?.email) {
    await sendNotification(session.shop, "ownerBookingCancelled", vars, {
      to: shopRecord.email,
    });
  }
}

return { success: true };
```

**Step 2 — Add `buildVars` helper** to `app.booking.$id.jsx` (or import from shared util):
```js
function buildVars(shop, booking) {
  const [firstName, ...rest] = (booking.customerName || "").split(" ");
  return {
    "date":               booking.startDate,
    "start":              booking.startDate,
    "end":                booking.endDate || booking.startDate,
    "product.name":       booking.productTitle,
    "order.name":         booking.orderNumber ? `#${booking.orderNumber}` : "",
    "customer.firstName": firstName || "",
    "customer.lastName":  rest.join(" ") || "",
  };
}
```

**Step 3 — Add `ownerBookingCancelled` template** to `app/notification-defaults.js`:
```js
ownerBookingCancelled: {
  enabled: true,
  subject: "Booking Cancelled — {{product.name}}",
  body: "A booking has been cancelled.\n\nGuest: {{customer.firstName}} {{customer.lastName}}\nProperty: {{product.name}}\nDates: {{start}} → {{end}}\nOrder: {{order.name}}",
  timing: null,
},
```

**Step 4 — Add the tab** in `app/routes/app.notifications.jsx` TABS array:
```js
{ key: "ownerBookingCancelled", label: "Cancellation Alert (Owner)" },
```

---

## 3. Manual Booking Creation (Admin)

### What's Missing
There is no way for the merchant to create a booking from the admin. All bookings come only from the storefront widget.

### Files to Create / Edit
| Action | File |
|---|---|
| **NEW** | `app/routes/app.booking.new.jsx` |
| **EDIT** | `app/routes/app.booking.jsx` (add "New Booking" button) |

### Step-by-Step Implementation

**Step 1 — Add button** to `app.booking.jsx` header:
```jsx
<a href="/app/booking/new" style={{ ...primaryBtn }}>+ New Booking</a>
```

**Step 2 — Create `app/routes/app.booking.new.jsx`**

```
Loader:
  1. authenticate.admin(request) → get shop
  2. Fetch all active apartments for this shop
     prisma.apartment.findMany({ where: { shop, status: "active" } })
  3. Return { apartments }

Action (POST):
  1. Read form fields:
     apartmentId, startDate, endDate, nights, customerName, customerEmail,
     totalPrice, depositAmount, notes, status (default "confirmed")
  2. Find apartment to get productId + productTitle
  3. prisma.booking.create({
       shop,
       apartmentId,
       productId: apartment.productId,
       productTitle: apartment.productTitle,
       customerName,
       customerEmail,
       startDate,
       endDate,
       nights: parseInt(nights),
       totalPrice: parseFloat(totalPrice),
       depositAmount: depositAmount ? parseFloat(depositAmount) : null,
       status,
       lineItemProperties: { bookingType: "range", guests: {}, manualEntry: true },
     })
  4. Optionally send bookingConfirmation email if customerEmail provided
  5. redirect("/app/booking")

Component:
  Form with:
  - Apartment dropdown (from loader apartments)
  - Guest Name, Guest Email
  - Check-in Date, Check-out Date (date pickers)
  - Nights (auto-calculated from dates)
  - Total Price, Deposit Amount
  - Status selector (confirmed / pending)
  - Internal notes
  - Submit button
```

---

## 4. Real Billing History (Shopify Invoices)

### What's Missing
The Billing History table in `app.subscribtion.jsx` is a static empty placeholder. No real invoice data is fetched.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/app.subscribtion.jsx` (loader + component) |

### Step-by-Step Implementation

**Step 1 — Update loader** to query Shopify billing history via GraphQL:
```js
// In loader, after billing.check():
let invoices = [];
try {
  const res = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price { amount currencyCode }
                  interval
                }
              }
            }
          }
        }
        allSubscriptions(first: 10) {
          edges {
            node {
              id
              name
              status
              createdAt
              lineItems {
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price { amount currencyCode }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);
  const data = (await res.json())?.data;
  invoices = data?.currentAppInstallation?.allSubscriptions?.edges
    ?.map(({ node }) => ({
      id:     node.id,
      name:   node.name,
      status: node.status,
      date:   node.createdAt,
      amount: node.lineItems?.[0]?.plan?.pricingDetails?.price?.amount,
      currency: node.lineItems?.[0]?.plan?.pricingDetails?.price?.currencyCode,
    })) ?? [];
} catch (_) {}

return { ..., invoices };
```

**Step 2 — Replace placeholder table** in the component with real data:
```jsx
{invoices.length === 0 ? (
  <div>No invoices yet.</div>
) : (
  invoices.map((inv) => (
    <tr key={inv.id}>
      <td>{inv.id.split("/").pop()}</td>
      <td>{new Date(inv.date).toLocaleDateString()}</td>
      <td>{inv.name}</td>
      <td>${inv.amount} {inv.currency}</td>
      <td><StatusBadge status={inv.status} /></td>
    </tr>
  ))
)}
```

---

## ~~5. Yearly Billing API Integration~~ ✅ COMPLETED

### What's Missing
The UI has a Monthly/Yearly toggle with a -20% discount badge, but clicking "Yearly" and then upgrading still uses the monthly plan. No yearly plan is configured.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/plans.server.js` |
| **EDIT** | `app/routes/app.subscribtion.jsx` (action) |
| **EDIT** | `app/shopify.server.js` (billing config) |

### Step-by-Step Implementation

**Step 1 — Add yearly plan names** to `plans.server.js`:
```js
export const BILLING_PLANS = {
  pro:          { name: "Pro",          amount: 19, currencyCode: "USD", trialDays: 7, interval: "EVERY_30_DAYS" },
  pro_yearly:   { name: "Pro Yearly",   amount: Math.round(19 * 0.8 * 12), currencyCode: "USD", trialDays: 7, interval: "ANNUAL" },
  business:     { name: "Business",     amount: 49, currencyCode: "USD", trialDays: 7, interval: "EVERY_30_DAYS" },
  business_yearly: { name: "Business Yearly", amount: Math.round(49 * 0.8 * 12), currencyCode: "USD", trialDays: 7, interval: "ANNUAL" },
};
```

**Step 2 — Add yearly plans to Shopify billing config** in `shopify.server.js`:
```js
billing: {
  "Pro":            { amount: 19,  currencyCode: "USD", interval: BillingInterval.Every30Days, trialDays: 7 },
  "Pro Yearly":     { amount: 182, currencyCode: "USD", interval: BillingInterval.Annual,      trialDays: 7 },
  "Business":       { amount: 49,  currencyCode: "USD", interval: BillingInterval.Every30Days, trialDays: 7 },
  "Business Yearly":{ amount: 470, currencyCode: "USD", interval: BillingInterval.Annual,      trialDays: 7 },
},
```

**Step 3 — Update action** in `app.subscribtion.jsx`:
```js
const billing_period = formData.get("billing_period"); // "monthly" | "yearly"
const planMap = {
  pro:      { monthly: "Pro",      yearly: "Pro Yearly"      },
  business: { monthly: "Business", yearly: "Business Yearly" },
};
const shopifyPlanName = planMap[plan.toLowerCase()]?.[billing_period] ?? plan;
await billing.request({ plan: shopifyPlanName, isTest: true, returnUrl });
```

**Step 4 — Update `planKeyFromName()`** in `plans.server.js`:
```js
export function planKeyFromName(name) {
  if (!name) return "free";
  const lower = name.toLowerCase();
  if (lower.includes("business")) return "business";
  if (lower.includes("pro"))      return "pro";
  return "free";
}
// (yearly plans map to same key — no change to DB logic needed)
```

---

## ~~6. Booking Edit (Change Dates & Guest Info)~~ ✅ COMPLETED

### What's Missing
The booking detail page (`app.booking.$id.jsx`) only allows status changes. Dates, guest name, email, and other booking details cannot be edited.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/app.booking.$id.jsx` (add edit fields + action) |

### Step-by-Step Implementation

**Step 1 — Add edit state** to the booking detail component:
```js
const [editing, setEditing] = useState(false);
const [guestName, setGuestName] = useState(booking.guest);
const [guestEmail, setGuestEmail] = useState(booking.email);
const [checkIn, setCheckIn] = useState(booking.checkIn);
const [checkOut, setCheckOut] = useState(booking.checkOut);
const [notes, setNotes] = useState(booking.notes ?? "");
```

**Step 2 — Add "Edit" button** and conditional form:
```jsx
{editing ? (
  <form method="POST">
    <input type="hidden" name="intent" value="edit" />
    <input name="customerName"  value={guestName}  onChange={e => setGuestName(e.target.value)} />
    <input name="customerEmail" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} />
    <input type="date" name="startDate" value={checkIn}  onChange={e => setCheckIn(e.target.value)} />
    <input type="date" name="endDate"   value={checkOut} onChange={e => setCheckOut(e.target.value)} />
    <button type="submit">Save Changes</button>
    <button type="button" onClick={() => setEditing(false)}>Cancel</button>
  </form>
) : (
  <button onClick={() => setEditing(true)}>Edit</button>
)}
```

**Step 3 — Update action** to handle `intent: "edit"`:
```js
if (intent === "edit") {
  const startDate = fd.get("startDate");
  const endDate   = fd.get("endDate");
  const nights    = startDate && endDate
    ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000)
    : null;

  await prisma.booking.update({
    where: { id: params.id, shop: session.shop },
    data: {
      customerName:  fd.get("customerName")  || null,
      customerEmail: fd.get("customerEmail") || null,
      startDate:     startDate || undefined,
      endDate:       endDate   || undefined,
      nights:        nights    ?? undefined,
    },
  });
  return { success: true, edited: true };
}
```

---

## ~~7. Calendar View of Bookings (Month/Week)~~ ✅ COMPLETED

### What's Missing
Bookings are only shown in a table list. No visual calendar showing which apartments are booked on which days.

### Files to Create / Edit
| Action | File |
|---|---|
| **NEW** | `app/routes/app.booking.calendar.jsx` |
| **EDIT** | `app/routes/app.booking.jsx` (add calendar tab/toggle) |

### Step-by-Step Implementation

**Step 1 — Add View toggle** to `app.booking.jsx`:
```jsx
<div style={{ display: "flex", gap: 8 }}>
  <a href="/app/booking">List View</a>
  <a href="/app/booking/calendar">Calendar View</a>
</div>
```

**Step 2 — Create `app/routes/app.booking.calendar.jsx`**:
```
Loader:
  1. authenticate.admin(request)
  2. Parse ?month=2025-07 from URL (default = current month)
  3. Calculate monthStart and monthEnd
  4. prisma.booking.findMany({
       where: { shop, startDate: { gte: monthStart, lte: monthEnd } },
       select: { id, apartmentId, productTitle, startDate, endDate, customerName, status }
     })
  5. Fetch all apartments for the sidebar legend
  6. Return { bookings, apartments, month }

Component:
  - Month navigation (← Prev / Next →)
  - Grid: 7 columns (Sun-Sat), rows = weeks in the month
  - Each booking renders as a colored bar spanning its date range
  - Color coded by apartment (each apartment gets an assigned color)
  - Clicking a booking bar → navigate to /app/booking/:id
  - Sidebar: apartment legend with colored dots
```

**Step 3 — Render calendar cells** in pure JS/JSX (no external library needed):
```js
// Generate all days in the month
const days = [];
const d = new Date(year, month, 1);
while (d.getMonth() === month) {
  days.push(new Date(d));
  d.setDate(d.getDate() + 1);
}

// For each day, find bookings that overlap
function getBookingsForDay(date) {
  const s = toStr(date);
  return bookings.filter(b => b.startDate <= s && (b.endDate ?? b.startDate) >= s);
}
```

---

## ~~8. Apartment Photo Uploads~~ ✅ COMPLETED

### What's Missing
No image field on the `Apartment` model. No photo upload UI. No photos shown in the storefront widget.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `prisma/schema.prisma` (add images field to Apartment settings or dedicated field) |
| **EDIT** | `app/routes/app.apartments.$id.jsx` (add photo upload section) |
| **EDIT** | `extensions/rentfic/assets/rentfic-booking.js` (render photos in widget) |

### Step-by-Step Implementation

**Step 1 — Store photos in `Apartment.settings` JSON** (no schema migration needed):
```js
// In settings blob:
settings.images = ["https://cdn.shopify.com/...", "https://cdn.shopify.com/..."]
```

**Step 2 — Upload photos via Shopify Files API** (GraphQL):
```graphql
mutation fileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      ... on MediaImage {
        image { url }
      }
    }
  }
}
```

**Step 3 — Add photo upload section** to `app.apartments.$id.jsx`:
```jsx
<s-section heading="Photos">
  <input
    type="file"
    accept="image/*"
    multiple
    onChange={handlePhotoUpload}
  />
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
    {images.map((url, i) => (
      <div key={i} style={{ position: "relative" }}>
        <img src={url} style={{ width: 100, height: 80, objectFit: "cover", borderRadius: 8 }} />
        <button onClick={() => removeImage(i)}>×</button>
      </div>
    ))}
  </div>
</s-section>
```

**Step 4 — Render photos in the storefront widget** (`rentfic-booking.js`):
```js
// In _render(), before the calendar:
if (this.apartment.images?.length) {
  html += `<div class="rentfic-gallery">`;
  this.apartment.images.forEach(url => {
    html += `<img src="${url}" class="rentfic-gallery-thumb" />`;
  });
  html += `</div>`;
}
```

---

## ~~9. Discounted Dates Visual Highlight in Widget~~ ✅ COMPLETED

### What's Missing
Discounted dates are calculated server-side when creating a booking, but in the calendar widget, discounted dates look identical to regular dates. Customers cannot see which dates have special pricing.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `extensions/rentfic/assets/rentfic-booking.js` |
| **EDIT** | `extensions/rentfic/assets/rentfic-booking.css` |

### Step-by-Step Implementation

**Step 1 — Expose discounted dates from the API** (`api.proxy.apartment.$productId.jsx`):
The `apartment.settings.discountedDates` is already returned in the API response. No server change needed.

**Step 2 — Build a discounted-date set** in the widget `_init()`:
```js
// After receiving apartment data:
this.discountedDateMap = {};  // { "2025-07-10": { value: 20, type: "percent" } }
(this.apartment.discountedDates || []).forEach(group => {
  group.dates.forEach(d => {
    this.discountedDateMap[d] = { value: group.value, type: group.type };
  });
});
```

**Step 3 — Apply a CSS class** in `_renderDay()`:
```js
_isDiscounted(date) {
  return !!this.discountedDateMap[this._toStr(date)];
}

// In the day cell render:
const isDiscounted = this._isDiscounted(date);
classes += isDiscounted ? " rentfic-day--discounted" : "";

// Add tooltip data:
if (isDiscounted) {
  const d = this.discountedDateMap[this._toStr(date)];
  attrs += ` title="${d.type === 'percent' ? d.value + '% off' : '$' + d.value + ' off'}"`;
}
```

**Step 4 — Add CSS** in `rentfic-booking.css`:
```css
.rentfic-day--discounted {
  background: #fffbe6;
  border: 1px solid #f6c90e;
  border-radius: 50%;
}
.rentfic-day--discounted::after {
  content: "%";
  font-size: 7px;
  color: #856404;
  position: absolute;
  bottom: 2px;
  right: 3px;
}
```

---

## ~~10. Amenities Display in Storefront Widget~~ ✅ COMPLETED

### What's Missing
The `apartment.settings.amenities` array is returned by the proxy API but is never rendered in the storefront widget HTML.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `extensions/rentfic/assets/rentfic-booking.js` |
| **EDIT** | `extensions/rentfic/assets/rentfic-booking.css` |

### Step-by-Step Implementation

**Step 1 — Add amenities section** to the widget `_render()` method, after the calendar and before the Reserve button:

```js
_renderAmenities() {
  const amenities = this.apartment.amenities || [];
  if (!amenities.length) return "";
  return `
    <div class="rentfic-amenities">
      <div class="rentfic-amenities-title">What's included</div>
      <div class="rentfic-amenities-list">
        ${amenities.map(a => `
          <span class="rentfic-amenity-tag">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${a}
          </span>
        `).join("")}
      </div>
    </div>
  `;
}
```

**Step 2 — Add CSS** in `rentfic-booking.css`:
```css
.rentfic-amenities { margin: 14px 0; }
.rentfic-amenities-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #202223; }
.rentfic-amenities-list { display: flex; flex-wrap: wrap; gap: 6px; }
.rentfic-amenity-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; font-size: 12px; color: #3d3d3d;
  background: #f0f0f0; border-radius: 20px;
}
```

---

## ~~11. Map / Location Display in Widget~~ ✅ COMPLETED

### What's Missing
`address`, `city`, and `country` are stored per apartment but never shown to customers on the storefront.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `extensions/rentfic/assets/rentfic-booking.js` |

### Step-by-Step Implementation

**Step 1 — Add location section** in widget `_render()`:
```js
_renderLocation() {
  const { address, city, country } = this.apartment;
  if (!city && !country) return "";
  const locationStr = [address, city, country].filter(Boolean).join(", ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationStr)}`;
  return `
    <div class="rentfic-location">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
      <a href="${mapsUrl}" target="_blank" rel="noopener" class="rentfic-location-link">
        ${locationStr}
      </a>
    </div>
  `;
}
```

---

## 12. Multi-Language Storefront Widget

### What's Missing
`translate` setting exists in `app/routes/app.settings.jsx` and is stored in `Shop.settings.translate`, but the widget always renders English text.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/api.proxy.apartment.$productId.jsx` (pass translate setting) |
| **EDIT** | `extensions/rentfic/assets/rentfic-booking.js` (i18n strings) |

### Step-by-Step Implementation

**Step 1 — Add locale strings object** to `rentfic-booking.js`:
```js
const I18N = {
  en: {
    reserveNow: "Reserve Now",
    checkIn: "Check-in",
    checkOut: "Check-out",
    guests: "Guests",
    adults: "Adults",
    children: "Children",
    infants: "Infants",
    total: "Total",
    nights: "night(s)",
    selectDates: "Select your dates",
  },
  fr: {
    reserveNow: "Réserver maintenant",
    checkIn: "Arrivée",
    checkOut: "Départ",
    guests: "Voyageurs",
    adults: "Adultes",
    children: "Enfants",
    infants: "Bébés",
    total: "Total",
    nights: "nuit(s)",
    selectDates: "Sélectionnez vos dates",
  },
  de: { /* German translations */ },
  es: { /* Spanish translations */ },
  // Add more locales as needed
};
```

**Step 2 — Detect locale** in `_init()`:
```js
const lang = this.shopSettings.translate === "automatic"
  ? (document.documentElement.lang || navigator.language || "en").slice(0, 2)
  : (this.shopSettings.translate || "en");
this.t = I18N[lang] || I18N.en;
```

**Step 3 — Replace hardcoded strings** throughout the widget with `this.t.reserveNow`, `this.t.checkIn`, etc.

---

## 13. iCal / Google Calendar Export & Sync

### What's Missing
No way to export bookings as `.ics` (iCalendar) for use in Google Calendar, Apple Calendar, or Outlook.

### Files to Create
| Action | File |
|---|---|
| **NEW** | `app/routes/api.export.ical.$apartmentId.jsx` |
| **EDIT** | `app/routes/app.booking.$id.jsx` (add download link) |

### Step-by-Step Implementation

**Step 1 — Create `api.export.ical.$apartmentId.jsx`**:
```js
// loader:
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);

  const bookings = await prisma.booking.findMany({
    where: {
      shop: session.shop,
      apartmentId: params.apartmentId,
      status: { in: ["confirmed", "completed"] },
    },
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rentfic//Rentfic Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  bookings.forEach(b => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${b.id}@rentfic`);
    lines.push(`DTSTART;VALUE=DATE:${b.startDate.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${(b.endDate ?? b.startDate).replace(/-/g, "")}`);
    lines.push(`SUMMARY:${b.customerName ?? "Booking"} — ${b.productTitle}`);
    lines.push(`STATUS:CONFIRMED`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="rentfic-bookings.ics"`,
    },
  });
};
```

**Step 2 — Add export link** to booking list and apartment detail pages.

---

## 14. Bulk Booking Actions

### What's Missing
No way to select multiple bookings and perform a bulk action (bulk confirm, bulk cancel, bulk delete).

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/app.booking.jsx` (add checkboxes + bulk action bar) |

### Step-by-Step Implementation

**Step 1 — Add checkbox column** to the bookings table header and each row:
```jsx
const [selected, setSelected] = useState(new Set());

// Header checkbox (select all)
<input type="checkbox" onChange={e => {
  if (e.target.checked) setSelected(new Set(bookings.map(b => b.id)));
  else setSelected(new Set());
}} />

// Row checkbox
<input
  type="checkbox"
  checked={selected.has(b.id)}
  onChange={() => setSelected(prev => {
    const next = new Set(prev);
    next.has(b.id) ? next.delete(b.id) : next.add(b.id);
    return next;
  })}
/>
```

**Step 2 — Add bulk action bar** (visible when `selected.size > 0`):
```jsx
{selected.size > 0 && (
  <div style={{ display: "flex", gap: 8, padding: "10px 0" }}>
    <span>{selected.size} selected</span>
    <button onClick={() => bulkAction("confirmed")}>Confirm All</button>
    <button onClick={() => bulkAction("cancelled")}>Cancel All</button>
    <button onClick={() => bulkAction("delete")}>Delete All</button>
  </div>
)}
```

**Step 3 — Add bulk action handler** to `app.booking.jsx` action:
```js
if (intent === "bulk") {
  const ids   = JSON.parse(formData.get("ids"));
  const action = formData.get("bulkAction");

  if (action === "delete") {
    await prisma.booking.deleteMany({ where: { shop, id: { in: ids } } });
  } else {
    await prisma.booking.updateMany({ where: { shop, id: { in: ids } }, data: { status: action } });
  }
  return { success: true };
}
```

---

## 15. Bulk Apartment Actions

### What's Missing
The apartment list has checkboxes in the UI but bulk actions (bulk delete, bulk activate/deactivate) are not wired up.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/app.apartments._index.jsx` (wire up `selected` state + action) |

### Step-by-Step Implementation

**Step 1 — Check if `selected` state already exists** — it does (`useState(new Set())`). Just need to wire it to the action.

**Step 2 — Add a bulk action bar** (similar to booking bulk actions above):
```jsx
{selected.size > 0 && (
  <div>
    <span>{selected.size} apartments selected</span>
    <button onClick={() => submitBulk("delete")}>Delete Selected</button>
    <button onClick={() => submitBulk("deactivate")}>Deactivate Selected</button>
    <button onClick={() => submitBulk("activate")}>Activate Selected</button>
  </div>
)}
```

**Step 3 — Add bulk intent handler** to the action:
```js
if (intent === "bulk") {
  const ids      = JSON.parse(formData.get("ids"));
  const bulkAction = formData.get("bulkAction");
  if (bulkAction === "delete") {
    await prisma.apartment.deleteMany({ where: { shop, id: { in: ids } } });
  } else {
    await prisma.apartment.updateMany({
      where: { shop, id: { in: ids } },
      data: { status: bulkAction === "activate" ? "active" : "inactive" },
    });
  }
}
```

---

## 16. Apartment Duplication

### What's Missing
No "Duplicate" button to clone an existing apartment with all its settings.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/app.apartments._index.jsx` (add duplicate button + action intent) |

### Step-by-Step Implementation

**Step 1 — Add a Duplicate icon button** next to the Edit button in each apartment row.

**Step 2 — Add `intent: "duplicate"` to the action**:
```js
if (intent === "duplicate") {
  const id = formData.get("id");
  const source = await prisma.apartment.findUnique({ where: { id } });
  if (!source) return { error: "Not found" };

  // Check plan limits before duplicating
  const count = await prisma.apartment.count({ where: { shop } });
  const limits = getPlanLimits(shopRecord?.plan);
  if (count >= limits.apartments) {
    return { error: "Plan limit reached" };
  }

  await prisma.apartment.create({
    data: {
      shop:         source.shop,
      productId:    source.productId,      // NOTE: should ideally pick a new product
      productTitle: source.productTitle + " (Copy)",
      name:         source.name + " (Copy)",
      status:       "draft",               // start as draft
      pricePerNight: source.pricePerNight,
      settings:     source.settings,      // deep copy all settings
    },
  });

  return { success: true };
}
```

> **Note:** The duplicate shares the same Shopify product. Merchant should re-link to a different product after duplicating.

---

## 17. Owner Cancellation Email

### What's Missing
When a booking is cancelled, the shop owner receives no email notification.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/notification-defaults.js` (add template) |
| **EDIT** | `app/routes/app.booking.$id.jsx` (send in action — see Feature #2) |
| **EDIT** | `app/routes/app.notifications.jsx` (add tab) |

### Step-by-Step

This is covered as part of **Feature #2** (Booking Cancellation Email). The `ownerBookingCancelled` template should be added to `notification-defaults.js` and a tab added to the Notifications page. The email is sent in the booking status change action.

---

## 18. Priority Support Widget (Business Plan)

### What's Missing
Business plan lists "Priority Support" as a feature, but there is no support chat widget, help link, or dedicated support email form.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/app.jsx` (conditionally render support widget) |

### Step-by-Step Implementation

**Step 1 — Add a Crisp / Intercom / Tawk.to chat script** conditionally for Business plan:
```jsx
// In app.jsx, read appPlan from loader:
{appPlan === "business" && (
  <script
    dangerouslySetInnerHTML={{
      __html: `
        window.$crisp=[];window.CRISP_WEBSITE_ID="YOUR_CRISP_ID";
        (function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";
        s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
      `,
    }}
  />
)}
```

**Alternative — Simple help link** if no chat service:
```jsx
{appPlan === "business" && (
  <a
    href="mailto:priority@rentfic.com?subject=Priority Support"
    style={{ /* badge style */ }}
  >
    Priority Support
  </a>
)}
```

---

## 19. Export Bookings as CSV/PDF

### What's Missing
No way to download booking data for reporting or external processing.

### Files to Create
| Action | File |
|---|---|
| **NEW** | `app/routes/api.export.bookings.jsx` |
| **EDIT** | `app/routes/app.booking.jsx` (add Export button) |

### Step-by-Step Implementation

**Step 1 — Create `api.export.bookings.jsx`**:
```js
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "csv"; // "csv" or "json"

  const bookings = await prisma.booking.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  if (format === "csv") {
    const headers = ["ID","Order","Guest","Email","Apartment","Check-in","Check-out","Nights","Total","Deposit","Status","Created"];
    const rows = bookings.map(b => [
      b.id, b.orderNumber ?? "", b.customerName ?? "", b.customerEmail ?? "",
      b.productTitle, b.startDate, b.endDate ?? "", b.nights ?? "",
      b.totalPrice ?? "", b.depositAmount ?? "", b.status,
      new Date(b.createdAt).toISOString().split("T")[0],
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="rentfic-bookings-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  return Response.json(bookings);
};
```

**Step 2 — Add Export button** to `app.booking.jsx`:
```jsx
<a href="/api/export/bookings?format=csv" download>Export CSV</a>
```

---

## 20. Occupancy Rate Tracking

### What's Missing
Part of the Analytics feature. No per-apartment or overall occupancy calculation exists.

### Implementation (inside `app.analytics.jsx` — see Feature #1)

```js
// For each apartment, calculate occupancy for the last 30 days:
async function calcOccupancy(shop, apartments, days = 30) {
  const end   = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const results = await Promise.all(apartments.map(async apt => {
    const bookings = await prisma.booking.findMany({
      where: {
        shop,
        apartmentId: apt.id,
        status: { in: ["confirmed", "completed"] },
        startDate: { lte: toStr(end) },
        endDate:   { gte: toStr(start) },
      },
      select: { startDate: true, endDate: true },
    });

    // Count distinct booked days in the window
    const bookedDays = new Set();
    bookings.forEach(b => {
      const s = new Date(b.startDate);
      const e = new Date(b.endDate ?? b.startDate);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        bookedDays.add(toStr(d));
      }
    });

    return {
      name: apt.name,
      bookedDays: bookedDays.size,
      totalDays: days,
      rate: Math.round((bookedDays.size / days) * 100),
    };
  }));

  return results;
}
```

---

## 21. Admin Mobile Responsiveness

### What's Missing
Most admin pages use `gridTemplateColumns: "repeat(4, 1fr)"` and similar fixed-column layouts with inline styles that break on small screens.

### Files to Edit
| Action | File |
|---|---|
| **EDIT** | `app/routes/app._index.jsx` |
| **EDIT** | `app/routes/app.apartments.$id.jsx` |
| **EDIT** | `app/routes/app.booking.jsx` |

### Step-by-Step Implementation

**Step 1 — Replace fixed grid columns** with responsive ones:
```jsx
// Instead of:
gridTemplateColumns: "repeat(4, 1fr)"

// Use:
gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
```

**Step 2 — Add responsive table wrapper**:
```jsx
<div style={{ overflowX: "auto" }}>
  <table style={{ width: "100%", minWidth: 600 }}>
    ...
  </table>
</div>
```

**Step 3 — Add CSS media query file** or use inline style helpers:
```css
@media (max-width: 768px) {
  .rentfic-grid-4 { grid-template-columns: 1fr 1fr; }
  .rentfic-grid-3 { grid-template-columns: 1fr 1fr; }
  .rentfic-grid-2 { grid-template-columns: 1fr; }
}
```

---

## 22. Clean Up app.additional.jsx Placeholder

### What's Missing
`app/routes/app.additional.jsx` still has the default Shopify app template boilerplate and is accessible but unused.

### Options
1. **Delete the file** and remove the route from `app/routes.js` if not needed.
2. **Repurpose it** as a Help & Documentation page.

### Step-by-Step (Repurpose as Help page)

**Step 1 — Rename** to `app.help.jsx` and update `app/routes.js`.

**Step 2 — Update nav link** in `app.jsx`:
```jsx
<s-link href="/app/help">Help</s-link>
```

**Step 3 — Add content** — quick start guide, FAQ, link to documentation.

---

## Implementation Priority Order

| # | Feature | Effort | Impact |
|---|---|---|---|
| 2 | Cancellation email auto-trigger | Low (30 min) | High |
| 10 | Amenities in widget | Low (1 hr) | Medium |
| 9 | Discounted dates highlight | Low (1 hr) | Medium |
| 11 | Location in widget | Low (1 hr) | Medium |
| 6 | Booking edit | Medium (2 hrs) | High |
| 3 | Manual booking creation | Medium (3 hrs) | High |
| 14 | Bulk booking actions | Medium (2 hrs) | Medium |
| 16 | Apartment duplication | Medium (1 hr) | Medium |
| 5 | Yearly billing integration | Medium (2 hrs) | High |
| 4 | Real billing history | Medium (2 hrs) | Medium |
| 7 | Calendar view of bookings | High (4-6 hrs) | Medium |
| 8 | Apartment photos | High (4-6 hrs) | High |
| 12 | Multi-language widget | High (4-6 hrs) | Medium |
| 13 | iCal export | Medium (2 hrs) | Low |
| 19 | CSV export | Low (1 hr) | High |
| 1 | Analytics dashboard | High (8+ hrs) | High |
| 21 | Mobile responsiveness | High (4-6 hrs) | Medium |
| 22 | Clean up placeholder | Low (30 min) | Low |

---

*Based on Rentfic Feature Audit — September 2026*
