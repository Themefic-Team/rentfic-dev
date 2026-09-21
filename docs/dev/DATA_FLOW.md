# Rentfic — Data Flow & Storage Deep Dive

> **Verified against**: all files in `app/routes/`, `prisma/schema.prisma`, `app/email.server.js`, `app/shopify.server.js`, `extensions/rentfic/`

---

## Table of Contents

1. [How Data Storage Works](#1-how-data-storage-works)
2. [How Routes Work (Loader/Action Pattern)](#2-how-routes-work-loaderaction-pattern)
3. [Apartment Data — Full Lifecycle](#3-apartment-data--full-lifecycle)
4. [Booking Data — Full Lifecycle](#4-booking-data--full-lifecycle)
5. [Shop Settings — Full Lifecycle](#5-shop-settings--full-lifecycle)
6. [Notification Config — Full Lifecycle](#6-notification-config--full-lifecycle)
7. [Shopify Metafields — What Gets Written & When](#7-shopify-metafields--what-gets-written--when)
8. [Frontend State Management](#8-frontend-state-management)
9. [How the Proxy API Reads & Writes Data](#9-how-the-proxy-api-reads--writes-data)
10. [Complete Data Flow Diagrams](#10-complete-data-flow-diagrams)

---

## 1. How Data Storage Works

The app uses **two separate storage layers** that must be kept in sync:

| Layer | What it stores | Accessed via |
|---|---|---|
| **PostgreSQL (Prisma)** | All app data: apartments, bookings, shop settings, sessions, notification config | `prisma.*` calls in loaders/actions |
| **Shopify (metafields + product variants)** | `rentfic.is_apartment` flag on products; variant price (the booking total shown at checkout) | Shopify Admin GraphQL API |

There is no Redis cache or in-memory store. Each server request re-queries Prisma directly.

> [!IMPORTANT]
> The product variant price in Shopify is **mutable and transient** — it is overwritten on every booking attempt to reflect the calculated total. The authoritative pricing data lives in Prisma (`Apartment.pricePerNight` and `Apartment.settings.additionalFees`).

---

## 2. How Routes Work (Loader/Action Pattern)

The app uses React Router v7 (Remix-style) file-based routing. Every route file can export:

- **`loader`** — runs on the server when the page loads (GET). Returns data to the component.
- **`action`** — runs on the server when a form is submitted (POST). Receives form data.
- **default export** — the React component rendered in the browser.

```
Browser                 Server (Node.js)
───────                 ─────────────────
GET /app/apartments  →  loader() runs
                     ←  returns { apartments, apartmentLimit }
Component renders
User clicks Save     
POST /app/apartments/id →  action() runs → prisma.apartment.update()
                         ←  returns { success: true }
Component re-renders with new data (React Router revalidates)
```

### Intent pattern

Many routes handle multiple operations via a single `action`. They use a hidden `intent` form field to distinguish them:

```javascript
// Client
fd.append("intent", "delete");
submit(fd, { method: "POST" });

// Server (action)
const intent = fd.get("intent");
if (intent === "delete") { ... }
if (intent === "duplicate") { ... }
```

### `useFetcher` vs `useSubmit`

- `useSubmit` — triggers a full navigation (page reloads with new loader data).
- `useFetcher` — submits in the background without navigating (used for inline status changes, invoice sends, etc. in the bookings list).

---

## 3. Apartment Data — Full Lifecycle

### 3.1 Creating an Apartment

**Trigger**: Admin clicks "+ Add Apartment" on `/app/apartments`

**Step 1 — Product selection (browser)**:
```javascript
// app/routes/app.apartments._index.jsx
const result = await shopify.resourcePicker({ type: "product", multiple: false });
const p = result[0];
// Navigate to new apartment form with product pre-filled
navigate(`/app/apartments/new?productId=${p.id}&productTitle=${p.title}`);
```

**Step 2 — Form submission (browser → server)**:

The apartment form (`app/routes/app.apartments.$id.jsx`) submits via Shopify App Bridge `SaveBar`. All settings are serialized into `FormData`:

```
productId        = "gid://shopify/Product/12345"
productTitle     = "Ocean View Suite"
name             = "Ocean View Suite"
status           = "active"
pricePerNight    = "120"
bookingType      = "nightly"
minDays          = "2"
amenities[]      = "WiFi"
amenities[]      = "Pool"
additionalFees   = '[{"name":"Cleaning","type":"flat","amount":50}]'
blockedDates     = '["2025-12-25"]'
weeklyAvailability = '{"mon":{"enabled":true,"open":"00:00","close":"23:59"}}'
...
```

**Step 3 — Server action** (`app/routes/app.apartments.$id.jsx` → `action()`):

```javascript
// 1. Split fields: top-level columns vs JSON settings blob
const core = { shop, productId, productTitle, name, status, pricePerNight };
const settings = { bookingType, minDays, amenities, additionalFees, ... };

// 2. Write to Prisma
await prisma.apartment.create({ data: { ...core, settings } });

// 3. Sync Shopify product variant price
await syncVariantPrice(admin, productId, pricePerNight);
// → GraphQL: productVariantsBulkUpdate (sets price + inventoryPolicy: CONTINUE)
// → GraphQL: inventoryItemUpdate (tracked: false — prevents "Sold out")

// 4. Write metafields to Shopify product
await setRentficMetafields(admin, productId, settings);
// → GraphQL: productUpdate with:
//   - rentfic.is_apartment = "true"
//   - rentfic.additional_fees = JSON.stringify(settings.additionalFees)

// 5. Redirect to the new apartment's edit page
return redirect(`/app/apartments/${created.id}?saved=1`);
```

**What is written where**:

| Storage | Field | Value |
|---|---|---|
| PostgreSQL `Apartment` | All columns | Created |
| Shopify product variant | `price` | `pricePerNight` |
| Shopify product variant | `inventoryPolicy` | `CONTINUE` |
| Shopify inventory item | `tracked` | `false` |
| Shopify product metafield | `rentfic.is_apartment` | `"true"` |
| Shopify product metafield | `rentfic.additional_fees` | JSON string |

---

### 3.2 Updating an Apartment

Same form submission path as create, but `params.id !== "new"`:

```javascript
// Server action
await prisma.apartment.update({
  where: { id: params.id },
  data:  { ...updateCore, settings },
});
await syncVariantPrice(admin, productId, pricePerNight);
await setRentficMetafields(admin, productId, settings);
return { success: true }; // No redirect — stays on same page
```

The `SaveBar` shows "Unsaved changes" while the form is dirty (detected by comparing current React state to the loader data snapshot). On save, App Bridge calls `shopify.saveBar.hide()` and shows a toast.

---

### 3.3 Deleting an Apartment

**Route**: `POST /app/apartments` with `intent: "delete"`

```javascript
// 1. Delete from Prisma
await prisma.apartment.delete({ where: { id } });

// 2. Remove metafield from Shopify product
await admin.graphql(`mutation productUpdate($input: ProductInput!) { ... }`, {
  variables: {
    input: {
      id: productGid,
      metafields: [{ namespace: "rentfic", key: "is_apartment", value: "false" }],
    },
  },
});
```

> [!NOTE]
> Deleting an apartment does **not** delete its associated bookings. Bookings remain in the database and are still visible in the bookings list.

---

### 3.4 Duplicating an Apartment

**Route**: `POST /app/apartments` with `intent: "duplicate"`

```javascript
const source = await prisma.apartment.findUnique({ where: { id } });
await prisma.apartment.create({
  data: {
    ...source fields...,
    productTitle: source.productTitle + " (Copy)",
    name:         source.name + " (Copy)",
    status:       "draft",  // Always created as draft
    settings:     JSON.parse(JSON.stringify(source.settings)), // Deep copy
  },
});
```

The duplicate links to the **same Shopify product** as the original. It is created with `status: "draft"` so it does not appear in the widget immediately.

---

### 3.5 Bulk Status Changes

**Route**: `POST /app/apartments` with `intent: "bulk"`

```javascript
const ids = JSON.parse(fd.get("ids"));  // Array of cuid strings
const bulkAction = fd.get("bulkAction"); // "activate" | "deactivate" | "delete"

if (bulkAction === "delete") {
  await prisma.apartment.deleteMany({ where: { shop, id: { in: ids } } });
} else {
  await prisma.apartment.updateMany({
    where: { shop, id: { in: ids } },
    data:  { status: bulkAction === "activate" ? "active" : "inactive" },
  });
}
```

---

## 4. Booking Data — Full Lifecycle

### 4.1 Creating a Booking (Storefront Widget Flow)

```
Customer on product page
        ↓
Widget: POST /apps/rentfic/booking (App Proxy)
        ↓
Server: api.proxy.booking.jsx (action)
  1. authenticate.public.appProxy(request)  — validates Shopify proxy signature
  2. Parse body: { apartmentId, startDate, endDate, nights, guests, quantity }
  3. prisma.apartment.findFirst({ where: { id: apartmentId, shop } })
  4. Conflict check (or stock check if quantityEnabled)
  5. Calculate: total = base + fees - discounts
  6. Calculate: depositCharged (if depositEnabled)
  7. prisma.booking.create({ data: { status: "pending", ... } })
  8. updateVariantPrice(shop, productGid, finalTotal)
     → fetch Shopify Admin GraphQL (productVariantsBulkUpdate)
  9. getOrCreateDepositVariant() + updateVariantPriceByGid()  [if deposit]
 10. Return: { bookingId, finalTotal, isDeposit, depositVariantId, resetPrice }
        ↓
Widget: add product to cart with lineItem property _booking_id=bookingId
        ↓
Customer completes checkout
        ↓
Shopify fires orders/create webhook
        ↓
Server: webhooks.orders.create.jsx
  1. Find line items with _booking_id property
  2. prisma.booking.update({ status: "confirmed", orderId, orderNumber, customerName, customerEmail })
  3. sendNotification(shop, "bookingConfirmation", vars, { to: customerEmail })
  4. sendNotification(shop, "ownerNewBooking", vars, { to: shopEmail })
```

---

### 4.2 Creating a Manual Booking (Admin)

**Route**: `POST /app/booking/new`

```javascript
// Validates apartment ownership
const apartment = await prisma.apartment.findFirst({ where: { id: apartmentId, shop } });

// Creates booking directly as "confirmed" (no storefront checkout)
const booking = await prisma.booking.create({
  data: {
    shop, apartmentId,
    productId:    apartment.productId,
    productTitle: apartment.productTitle,
    customerName, customerEmail,
    startDate, endDate, nights,
    totalPrice, depositAmount,
    status,  // "confirmed" by default
    lineItemProperties: {
      bookingType: endDate ? "range" : "single",
      guests:      {},
      quantity:    1,
      manualEntry: true,
    },
  },
});

// Optionally send confirmation email
if (sendEmail && customerEmail) {
  await sendNotification(shop, "bookingConfirmation", vars, { to: customerEmail });
}

return redirect(`/app/booking/${booking.id}`);
```

---

### 4.3 Editing a Booking

**Route**: `POST /app/booking/:id` with `intent: "edit"` (via `useFetcher`)

Only the following fields can be edited from the admin UI:

```javascript
await prisma.booking.update({
  where: { id: params.id, shop: session.shop },
  data: {
    customerName,
    customerEmail,
    startDate,
    endDate,
    nights,     // auto-recalculated from dates
    notes,
    totalPrice,
    depositAmount,
  },
});
```

The `status`, `orderId`, `bookingType`, and `lineItemProperties` are **not editable** from this form.

---

### 4.4 Changing Booking Status

**Route**: `POST /app/booking/:id` with `status` field (no `intent`)

```javascript
const newStatus = fd.get("status");
const booking   = await prisma.booking.findFirst({ where: { id, shop } });

await prisma.booking.update({ where: { id }, data: { status: newStatus } });

// Side effect: send cancellation emails if status changes TO "cancelled"
if (newStatus === "cancelled" && booking.status !== "cancelled") {
  await sendNotification(shop, "bookingCancelled", vars, { to: customerEmail });
  await sendNotification(shop, "ownerBookingCancelled", vars, { to: shopEmail });
}
```

---

### 4.5 Balance Invoice Flow

**Route**: `POST /app/booking/:id` with `intent: "sendInvoice"`

```javascript
// 1. Check if draft order already exists
const draftId    = booking.draftOrderId;
const invoiceUrl = booking.draftOrderUrl;

// 2. If not, create one via Shopify Admin GraphQL
if (!draftId && booking.depositAmount && booking.totalPrice) {
  const balanceAmount = booking.totalPrice - booking.depositAmount;
  const draft = await admin.graphql(`
    mutation draftOrderCreate($input: DraftOrderInput!) { ... }
  `, {
    variables: {
      input: {
        lineItems: [{ title: "Balance Due — ...", quantity: 1, originalUnitPrice: balanceAmount }],
        email: customerEmail,
        tags: ["balance-due", "rentfic"],
      },
    },
  });
  
  // 3. Save draft order ID and URL to booking
  await prisma.booking.update({
    where: { id },
    data:  { draftOrderId: draft.id, draftOrderUrl: draft.invoiceUrl, balanceStatus: "pending" },
  });
}

// 4. Send the invoice via Shopify (emails the customer the payment link)
await admin.graphql(`
  mutation draftOrderInvoiceSend($id: ID!) { ... }
`, { variables: { id: draftId } });

// 5. Mark as invoiced
await prisma.booking.update({ where: { id }, data: { balanceStatus: "invoiced" } });
```

**Auto-invoice**: If `Apartment.settings.balanceAutoInvoice === true`, the system automatically creates a draft order when a booking is linked to an order (in `syncUnlinkedBookings()`).

---

### 4.6 Deleting a Booking

**Route**: `POST /app/booking/:id` with `intent: "delete"`

```javascript
await prisma.booking.delete({ where: { id: params.id } });
// No cascade deletes. NotificationLog records for this booking remain.
```

---

### 4.7 Bulk Booking Operations

**Route**: `POST /app/booking` with `intent: "bulk"`

```javascript
const ids        = JSON.parse(fd.get("ids"));
const bulkAction = fd.get("bulkAction"); // "delete" | "pending" | "confirmed" | "cancelled" | "completed"

if (bulkAction === "delete") {
  await prisma.booking.deleteMany({ where: { shop, id: { in: ids } } });
} else {
  await prisma.booking.updateMany({ where: { shop, id: { in: ids } }, data: { status: bulkAction } });
}
```

---

### 4.8 Unlinked Booking Sync

When the bookings list loads, it calls `syncUnlinkedBookings(admin, shop)` automatically. This handles the case where the `orders/create` webhook was missed or delayed.

```javascript
// Find all bookings with no orderId
const unlinked = await prisma.booking.findMany({
  where: { shop, orderId: null },
  select: { id, depositAmount, totalPrice, ... },
});

// Fetch latest 50 Shopify orders
const orders = admin.graphql(`query { orders(first: 50) { ... } }`);

// Match orders to bookings via customAttributes._booking_id
for (const order of orders) {
  const bookingId = order.lineItems[0].customAttributes["_booking_id"];
  if (unlinked.includes(bookingId)) {
    await prisma.booking.update({
      where: { id: bookingId },
      data:  { orderId, orderNumber, customerName, customerEmail, status: "confirmed" },
    });
  }
}
```

---

## 5. Shop Settings — Full Lifecycle

### Reading

The `app.jsx` (root layout) loader runs on every admin page load:

```javascript
// Sync shop metadata from Shopify GraphQL
const { data } = await admin.graphql(`
  query {
    shop { name email currencyCode ianaTimezone billingAddress { countryCodeV2 } }
    currentAppInstallation { activeSubscriptions { name status currentPeriodEnd } }
  }
`);

await prisma.shop.upsert({
  where:  { shop },
  update: { name, email, currency, timezone, country }, // plan is NEVER touched here
  create: { shop, name, email, plan: "free", currency, timezone, country },
});
```

### Writing (Settings Page)

**Route**: `POST /app/settings`

```javascript
const settings = {
  timezone:          formData.get("timezone"),
  timeFormat:        formData.get("timeFormat"),
  translate:         formData.get("translate"),
  redirectAfterCart: formData.get("redirectAfterCart"),
  displayCalendar:   formData.get("displayCalendar"),
  depositType:       formData.get("depositType"),
  depositValue:      parseFloat(formData.get("depositValue")),
  blockedDates:      formData.getAll("blockedDates"),
};

await prisma.shop.upsert({
  where:  { shop: session.shop },
  update: { settings },
  create: { shop: session.shop, settings },
});
```

The entire `settings` JSON blob is replaced on every save. Fields not in the form are lost. The `depositVariantGid` sub-key is written separately by the proxy API and is **not** part of the settings form.

### Writing (Plan — Only via Webhook)

```javascript
// webhooks.app_subscriptions.update.jsx
const newPlan = status === "ACTIVE" ? planKeyFromName(name) : "free";
await prisma.shop.upsert({ where: { shop }, update: { plan: newPlan }, create: { shop, plan: newPlan } });
```

---

## 6. Notification Config — Full Lifecycle

### Reading

**Route**: `GET /app/notifications` (loader)

```javascript
const config = await prisma.notificationConfig.findUnique({ where: { shop: session.shop } });
// Returns the raw config record (or null if not yet configured)
```

The component merges saved templates with defaults:
```javascript
const templates = Object.fromEntries(
  TABS.map(({ key }) => [key, { ...DEFAULT_TEMPLATES[key], ...(savedTemplates[key] ?? {}) }])
);
```

This means only **overridden** values need to be stored in the database. Unmodified templates always fall back to `notification-defaults.js`.

### Writing

**Route**: `POST /app/notifications` (action)

```javascript
const data = {
  shop:          session.shop,
  emailProvider: formData.get("emailProvider"),
  smtpHost:      formData.get("smtpHost"),
  smtpPort:      parseInt(formData.get("smtpPort")),
  smtpUser:      formData.get("smtpUser"),
  smtpPass:      formData.get("smtpPass"),
  smtpFromName:  formData.get("smtpFromName"),
  smtpFromEmail: formData.get("smtpFromEmail"),
  smtpEncryption: formData.get("smtpEncryption"),
  templates:     JSON.parse(formData.get("templates")),
};

await prisma.notificationConfig.upsert({
  where:  { shop: session.shop },
  update: data,
  create: data,
});
```

The entire `templates` JSON blob is replaced on every save. The client serializes the full template state (all 8 templates) as a single JSON string in the form.

### Test Email (no DB write)

**Route**: `POST /app/notifications` with `_intent: "test"`

```javascript
const type   = formData.get("type");   // e.g. "bookingConfirmation"
const to     = formData.get("to");     // test recipient email
const result = await sendNotification(session.shop, type, DUMMY_VARS, { to });
return { testResult: result };
```

No database write occurs. The notification is sent using the current saved config (or Ethereal fallback).

---

## 7. Shopify Metafields — What Gets Written & When

The app writes to exactly **one Shopify namespace**: `rentfic`.

| Metafield key | Namespace | Type | Written when |
|---|---|---|---|
| `is_apartment` | `rentfic` | `single_line_text_field` | Apartment created/updated (`"true"`), deleted (`"false"`) |
| `additional_fees` | `rentfic` | `json` | Apartment created/updated |

### How `is_apartment` controls the widget

The app embed block checks:
```liquid
{% if product.metafields.rentfic.is_apartment == 'true' %}
```

- If `true`: hides native add-to-cart / quantity buttons, loads the booking widget.
- If `false` or absent: block is invisible, product behaves normally.

### How variant prices are managed

The product variant price is used as a **temporary carrier** for the booking total:

```
Normal state:       variant.price = pricePerNight (e.g., $120)
During booking:     variant.price = finalTotal    (e.g., $650 = 5 nights × $120 + fees - discounts)
After checkout:     variant.price = pricePerNight (reset by POST /apps/rentfic/price-reset)
```

This is the mechanism that makes the Shopify checkout total equal the correct booking price.

> [!WARNING]
> If a customer abandons the checkout after `POST /apps/rentfic/booking` but before `POST /apps/rentfic/price-reset`, the variant price may stay at the booking total until the next booking attempt resets it. This is a known edge case.

---

## 8. Frontend State Management

The app uses **no external state management library** (no Redux, no Zustand, no Context API for app data). All state management is handled by:

### React Router loader data

The `useLoaderData()` hook provides server-fetched data to components. Data is re-fetched automatically after any action submission (React Router revalidation).

```javascript
// In component
const { apartments, apartmentLimit } = useLoaderData();
```

### Local React state for UI

Each form page maintains its own `useState` hooks for controlled inputs:

```javascript
// app.apartments.$id.jsx
const [name, setName]           = useState(apartment?.name ?? "");
const [pricePerNight, setPrice] = useState(apartment?.pricePerNight?.toString() ?? "");
const [amenities, setAmenities] = useState(apartment?.settings?.amenities ?? []);
const [additionalFees, setFees] = useState(apartment?.settings?.additionalFees ?? []);
```

### Dirty state tracking

Settings pages (apartments, notifications, global settings) compare current React state to the original loader data to determine if the form has unsaved changes. When dirty, the Shopify App Bridge `SaveBar` is shown:

```javascript
// Computed dirty check
const isDirty = useMemo(() => {
  return name !== (apartment?.name ?? "")
    || pricePerNight !== (apartment?.pricePerNight?.toString() ?? "")
    // ...etc
}, [name, pricePerNight, ..., apartment]);

// Show/hide SaveBar
useEffect(() => {
  isDirty
    ? shopify.saveBar.show("apartment-save-bar")
    : shopify.saveBar.hide("apartment-save-bar");
}, [isDirty, shopify]);
```

### `useFetcher` for non-navigating actions

Inline operations (status change dropdown, send invoice button, cancel button on bookings list) use `useFetcher`:

```javascript
const fetcher = useFetcher();

// Submit without full page navigation
fetcher.submit(
  { intent: "updateStatus", bookingId, status: "confirmed" },
  { method: "POST" }
);

// Check loading state
const isUpdating = fetcher.state !== "idle";
```

---

## 9. How the Proxy API Reads & Writes Data

The public proxy (`/apps/rentfic/*`) is the storefront widget's data layer. It uses `authenticate.public.appProxy(request)` which:
1. Validates the Shopify-signed `signature` query parameter.
2. Returns `{ session: { shop } }` — the shop domain derived from the signed request.

### Read path (GET apartment)

```
Widget in browser (mystore.myshopify.com)
  → GET https://mystore.myshopify.com/apps/rentfic/apartment/12345
  → Shopify App Proxy rewrites to:
  → GET https://rentfic-dev.onrender.com/api/proxy/apartment/12345?shop=mystore&hmac=...
  → authenticate.public.appProxy validates HMAC
  → prisma.apartment.findFirst({ where: { shop: "mystore.myshopify.com", productId: "gid://...12345" } })
  → prisma.shop.findUnique({ where: { shop } })
  → Return merged apartment + shopSettings JSON
```

### Write path (POST booking)

```
Widget in browser
  → POST https://mystore.myshopify.com/apps/rentfic/booking
  → Body: { apartmentId, startDate, endDate, nights, guests, quantity }
  → Shopify App Proxy rewrites to:
  → POST https://rentfic-dev.onrender.com/api/proxy/booking?shop=mystore&hmac=...
  → authenticate.public.appProxy validates HMAC
  → Conflict check via prisma.booking.findMany
  → prisma.booking.create (status: "pending")
  → updateVariantPrice (direct fetch to Shopify Admin GraphQL with offline token)
      prisma.session.findFirst({ where: { shop, isOnline: false } })
      → uses session.accessToken for auth
  → Return { bookingId, finalTotal, depositVariantId }
  → Widget adds product to cart with _booking_id hidden property
```

> [!NOTE]
> The proxy API uses the shop's **offline access token** from the `Session` table for Admin API calls. This token is retrieved via `prisma.session.findFirst({ where: { shop, isOnline: false } })`. If no offline session exists (e.g. after reinstall without re-auth), the variant price update silently fails but the booking record is still created.

---

## 10. Complete Data Flow Diagrams

### Storefront Booking Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Customer Browser (Shopify Storefront)                                  │
│                                                                         │
│  Product page loads                                                     │
│    ↓                                                                    │
│  app_embed.liquid checks: product.metafields.rentfic.is_apartment       │
│    ├─ false: nothing happens                                            │
│    └─ true: load rentfic-booking.js                                     │
│         ↓                                                               │
│    GET /apps/rentfic/apartment/:productId                               │
│         ↓                              ↓                                │
│    [Shopify App Proxy]            [Rentfic Server]                      │
│                                   prisma.apartment.findFirst()          │
│                                   prisma.shop.findUnique()              │
│                                        ↓                               │
│    Widget renders calendar & pricing ←─┘                               │
│         ↓                                                               │
│    Customer selects dates, clicks Reserve Now                           │
│         ↓                                                               │
│    POST /apps/rentfic/booking                                           │
│         ↓                              ↓                               │
│    [Shopify App Proxy]            [Rentfic Server]                      │
│                                   Conflict check                        │
│                                   Calculate total                       │
│                                   prisma.booking.create (pending)       │
│                                   Shopify GraphQL: update variant price │
│                                        ↓                               │
│    Widget adds to cart ←──────── { bookingId, finalTotal }             │
│         ↓                                                               │
│    Customer checks out & pays                                           │
│         ↓                                                               │
│    Shopify fires orders/create webhook                                  │
│         ↓                                                               │
│    [Rentfic Server]                                                     │
│    Find _booking_id in line items                                       │
│    prisma.booking.update (confirmed)                                    │
│    sendNotification → customer + owner emails                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Admin Apartment Save Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Admin Browser (Shopify Embedded App)                                   │
│                                                                         │
│  Edit apartment form → user changes settings                            │
│  isDirty = true → SaveBar appears                                       │
│  User clicks Save                                                       │
│    ↓                                                                    │
│  useSubmit() → POST /app/apartments/:id                                 │
│  FormData: { productId, name, pricePerNight, settings JSON fields... }  │
│    ↓                                                                    │
│  [Rentfic Server: action()]                                             │
│    1. authenticate.admin(request)                                       │
│    2. Parse FormData → core columns + settings JSON blob                │
│    3. prisma.apartment.update({ id, settings })                         │
│    4. Shopify GraphQL: productVariantsBulkUpdate (price)                │
│    5. Shopify GraphQL: inventoryItemUpdate (tracked: false)             │
│    6. Shopify GraphQL: productUpdate (metafields)                       │
│    7. return { success: true }                                          │
│    ↓                                                                    │
│  React Router revalidates → loader re-runs → new data in UI            │
│  SaveBar hides → Toast: "Saved"                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Plan Change Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Admin clicks Subscribe on /app/subscribtion                            │
│    ↓                                                                    │
│  POST /app/subscribtion with intent: "subscribe", planKey: "pro"        │
│    ↓                                                                    │
│  [Server] billing.request({ plan: "Pro", isTest: false })               │
│    ↓ redirects to Shopify payment confirmation                          │
│  Merchant approves payment on Shopify                                   │
│    ↓                                                                    │
│  Shopify fires app_subscriptions/update webhook                         │
│    ↓                                                                    │
│  [Server: webhooks.app_subscriptions.update.jsx]                        │
│  payload: { app_subscription: { name: "Pro", status: "ACTIVE" } }      │
│  planKeyFromName("Pro") → "pro"                                         │
│  prisma.shop.upsert({ plan: "pro" })                                    │
│    ↓                                                                    │
│  Next admin page load: loader reads Shop.plan = "pro"                   │
│  Apartment limit: Infinity  Analytics: false                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Email Notification Send Path

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Trigger: orders/create webhook OR admin cancel OR cron job             │
│    ↓                                                                    │
│  sendNotification(shop, type, vars, { to: email })                      │
│    ↓                                                                    │
│  1. prisma.notificationConfig.findUnique({ shop })                      │
│  2. Merge: { ...DEFAULT_TEMPLATES[type], ...savedTemplates[type] }      │
│  3. if (!tpl.enabled) → return { skipped: true }                        │
│  4. resolveTransport(config):                                           │
│     ├─ config.emailProvider === "smtp" && smtpHost → merchant SMTP      │
│     ├─ process.env.SMTP_HOST → app-level SMTP                          │
│     └─ fallback → Ethereal (dev only)                                   │
│  5. fill(tpl.subject, vars) → replace {{placeholders}}                  │
│  6. fill(tpl.body, vars)    → replace {{placeholders}}                  │
│  7. buildHtml(bodyText)     → wrap in styled <div>                      │
│  8. transport.sendMail({ from, to, subject, text, html })               │
│  9. return { sent: true }                                               │
│                                                                         │
│  For cron-triggered sends:                                              │
│  10. prisma.notificationLog.create({ bookingId, type })  [dedup guard]  │
└─────────────────────────────────────────────────────────────────────────┘
```
