# 11 — Webhooks & Internal API
**Last Updated:** 2026-10-05

## Webhook Handlers

### `webhooks.orders.create`
**File:** `app/routes/webhooks.orders.create.jsx`
**Trigger:** When a new Shopify order is created.

**What it does:**
1. Checks the order's line item properties for Rentfic booking data (`_rentfic_apartment_id`, `_check_in`, `_check_out`, etc.).
2. If found, finds the matching unlinked `Booking` record in DB.
3. Links the booking to the order: sets `orderId`, `orderNumber`, `customerName`, `customerEmail`.
4. Updates booking `status` to `"confirmed"`.
5. Triggers the `bookingConfirmation` email (guest) and `ownerNewBooking` email (admin).

---

### `webhooks.app_subscriptions.update`
**File:** `app/routes/webhooks.app_subscriptions.update.jsx`
**Trigger:** When a Shopify App Subscription status changes (activated, cancelled, expired).

**What it does:**
1. Parses the webhook payload (handles both nested and flat payload formats).
2. Extracts the subscription `name` and `status`.
3. Maps the subscription name to a plan key using `planKeyFromName()`.
4. If status is `ACTIVE` → sets `Shop.plan` to the mapped plan key.
5. If status is `CANCELLED` / `EXPIRED` / `DECLINED` → sets `Shop.plan` to `"free"`.

> **Note:** The app also optimistically updates `Shop.plan` to `"free"` immediately on cancel (before this webhook fires) to avoid UI delay.

---

### `webhooks.app.uninstalled`
**File:** `app/routes/webhooks.app.uninstalled.jsx`
**Trigger:** When the merchant uninstalls the app.

**What it does:** Deletes the shop's `Session` records from the DB.

---

### `webhooks.app.scopes_update`
**File:** `app/routes/webhooks.app.scopes_update.jsx`
**Trigger:** When OAuth scopes change (e.g. after app update).

**What it does:** Logs the event. No DB changes currently.

---

## Internal API Routes

### `GET /api/export/ical/:apartmentId`
**File:** `app/routes/api.export.ical.$apartmentId.jsx`

Returns an `.ics` calendar file (RFC 5545) containing all bookings for a specific rental. Used for syncing with Google Calendar, Apple Calendar, etc.

---

### `GET /api/export/bookings`
**File:** `app/routes/api.export.bookings.jsx`

Returns all bookings for the shop as a CSV download.

**Columns:** Order, Guest Name, Guest Email, Rental, Check-in, Check-out, Nights, Total, Deposit, Status, Created At.

---

### `POST /api/reminders`
**File:** `app/routes/api.reminders.jsx`

Scheduled endpoint (called by an external cron or Shopify Flow) that processes timed notification reminders.

**What it does:**
1. Finds bookings where `startDate` is N days from today (for Booking Reminder templates).
2. Finds bookings where checkout was N days ago (for Review Request templates).
3. Checks `NotificationLog` to avoid re-sending.
4. Calls `sendNotification()` for each eligible booking.
5. Writes a record to `NotificationLog` after sending.
