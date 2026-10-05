# 08 — Notifications
**Last Updated:** 2026-10-05

> Route: `app/routes/app.notifications.jsx` | Menu: Notifications
> Config stored in: `NotificationConfig` table
> Email logic: `app/email.server.js`
> Default templates: `app/notification-defaults.js`

## Overview

The Notifications page lets merchants customise all automated emails sent to guests and themselves at each stage of a booking lifecycle.

## UI Structure

### Top-Level Tabs
- **Guest Notifications** — emails sent to the customer.
- **Admin Notifications** — emails sent to the shop owner.

### Template Tabs (Guest)
| Tab Key | Label | Recipient | Timing |
|---|---|---|---|
| `bookingConfirmation` | Booking Confirmation | Guest | Immediately on order |
| `bookingReminder` | Booking Reminder | Guest | Configurable (days before check-in) |
| `checkinDay` | Check-in Day | Guest | Day of check-in |
| `checkoutReminder` | Check-out Reminder | Guest | Day before check-out |
| `bookingCancelled` | Cancellation | Guest | Immediately on cancel |
| `reviewRequest` | Review Request | Guest | Configurable (days after check-out) |

### Template Tabs (Admin)
| Tab Key | Label | Recipient |
|---|---|---|
| `ownerNewBooking` | New Booking Alert | Owner |
| `ownerBookingCancelled` | Cancellation | Owner |

## Template Fields

Each template has the following fields:

| Field | DB Key | Description |
|---|---|---|
| Enable toggle | `enabled` | Whether this notification is active |
| Subject | `subject` | Email subject line (supports variables) |
| Body | `body` | Email body (plain text / HTML, supports variables) |
| Days before/after *(Reminder only)* | `timing` | Number of days for timed reminders |
| Group emails *(Booking Reminder only)* | `groupMails` | Combine multiple reminders for same order into one email |
| When to remind *(Booking Reminder only)* | `whenToRemind` | `"disabled"` / `"immediately"` / `"1h"` / `"3h"` / `"12h"` / `"24h"` / `"48h"` |

> **Note:** "Group emails" and "When to remind" only appear on the Booking Reminder tab. All other templates fire immediately.

## Template Variables

Insert into Subject or Body using `{{variableName}}` syntax:

| Variable | Description |
|---|---|
| `{{date}}` | Booking Date |
| `{{start}}` | Check-in date |
| `{{end}}` | Check-out date |
| `{{product.name}}` | Rental name |
| `{{product.url}}` | Rental product URL |
| `{{order.name}}` | Shopify order name (e.g. #1001) |
| `{{order.note}}` | Order note |
| `{{customer.firstName}}` | Guest first name |
| `{{customer.lastName}}` | Guest last name |

Click any variable chip in the UI to insert it at the current cursor position in the focused Subject or Body field.

## Email Delivery

### Option 1 — Default (Shared Mail Service)
- Uses the app's own shared SMTP/sendgrid service.
- No configuration required.
- Available on **all plans including Free**.

### Option 2 — Custom SMTP
- Merchant provides their own SMTP server credentials.
- Available on **all plans including Free**.
- Fields: Host, Port, Username, Password, From Name, From Email, Encryption (`tls`/`ssl`).

## Test Email
- Available for every template.
- Enter any email address → click "Send [Template Name]".
- Server calls `sendNotification(shop, type, DUMMY_VARS, { to })` with placeholder data.
- Action returns `{ testResult: { ok: true } }` or an error for display.

## Save Behaviour
- Uses Shopify App Bridge `SaveBar`.
- All templates are serialised as a single JSON string and submitted as `FormData["templates"]`.
- SMTP credentials are submitted as individual form fields.
- Action upserts `NotificationConfig` for the shop.
