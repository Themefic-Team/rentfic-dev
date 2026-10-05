# 09 — Subscription
**Last Updated:** 2026-10-05

> Route: `app/routes/app.subscribtion.jsx` | Menu: Subscription
> See also: [03-plans-billing.md](./03-plans-billing.md) for billing flow details.

## Sections

### Current Plan Banner
- Shows current plan name and icon.
- Shows rental bookings used vs. limit (e.g. "1 of 1 Rental Bookings used").
- Shows a usage progress bar (turns red at 100% usage).
- For unlimited plans (Pro/Business), shows "Unlimited".

### Choose a Plan

#### Billing Period Toggle
- Monthly / Yearly selector.
- Yearly applies a **20% discount** (displayed as `-20%` badge).
- Switching the toggle updates displayed prices immediately (client-side state).

#### Plan Cards (3 cards: Free, Pro, Business)
| Plan | Price | Rental Bookings | Key Features |
|---|---|---|---|
| Free | $0 | 1 | Notifications, Custom SMTP |
| Pro | $19/mo | Unlimited | All Free features |
| Business | $49/mo | Unlimited | All Pro + Analytics, Priority Support |

- The currently active plan card shows a **"Current Plan"** badge and an "Active" indicator instead of a button.
- Non-active plans show an Upgrade/Downgrade button that submits the form.

#### Plan Card Actions
- **Upgrade (Pro/Business)**: posts `plan` + `billing_period` → triggers Shopify billing redirect.
- **Downgrade to Free**: posts `intent=cancel` → cancels active subscription, immediately sets DB plan to `"free"`.

### Full Feature Comparison Table
A static table comparing all 3 plans across 8 features:
- Rental Bookings, Booking calendar, Email notifications, Notification templates, SMTP delivery, Analytics & reports, Priority support, Monthly price.

### Billing History
- Fetched via `currentAppInstallation.allSubscriptions` GraphQL query (last 20 subscriptions).
- Shows: Invoice #, Date, Plan Name, Billing Interval, Amount, Status badge.
- Status colours: Active (green), Cancelled/Declined (red), Expired (grey), Frozen/Pending (yellow).
- Shows an empty state with placeholder table when no invoices exist.

### FAQ
4 common questions about cancellation, free trial, limits, and billing periods.
