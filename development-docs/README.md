# Rentfic — Development Documentation

> **At-a-glance index for the Rentfic Shopify rental app.**

---

## Document Index

| File | Covers |
|---|---|
| [01-architecture.md](./01-architecture.md) | Tech stack, folder layout, request lifecycle, auth |
| [02-database-schema.md](./02-database-schema.md) | All Prisma models, fields, relationships, indexes |
| [03-plans-billing.md](./03-plans-billing.md) | Free / Pro / Business plan limits, Shopify Billing API |
| [04-dashboard.md](./04-dashboard.md) | Dashboard — stats, embed banner, plan card |
| [05-rentals.md](./05-rentals.md) | Rentals list and Rental edit page — all fields |
| [06-global-settings.md](./06-global-settings.md) | Global Settings page — all fields |
| [07-booking.md](./07-booking.md) | Bookings list, calendar, new booking, booking detail |
| [08-notifications.md](./08-notifications.md) | Notification templates, SMTP, email delivery |
| [09-subscription.md](./09-subscription.md) | Subscription page, upgrade/downgrade flow |
| [10-frontend-storefront.md](./10-frontend-storefront.md) | Storefront proxy APIs, App Extension, booking widget |
| [11-webhooks-api.md](./11-webhooks-api.md) | Webhook handlers and internal API routes |

---

## Adding a New Feature

When you add a new feature, update the relevant doc file. Add:

```
## Feature Name
**Added:** YYYY-MM-DD

Short description...
```

The `.agents/skills/update-dev-docs` skill automates this — just describe what you built.
