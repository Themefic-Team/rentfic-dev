# Rentfic — Development Documentation

> Complete developer reference for the Rentfic Shopify app.

---

## Documents

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Tech stack, project structure, entry points, authentication, deployment |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | All Prisma models, fields, indexes, and JSON blob schemas |
| [WEBHOOKS.md](./WEBHOOKS.md) | All 4 Shopify webhook handlers with payload examples and retry notes |
| [API_REFERENCE.md](./API_REFERENCE.md) | All public proxy, admin export, and cron API endpoints with request/response schemas |
| [FEATURES.md](./FEATURES.md) | Every app feature and admin page documented with implementation details |
| [DATA_FLOW.md](./DATA_FLOW.md) | How data is stored, read, updated & deleted — full CRUD flows, Shopify metafields, frontend state, proxy API internals, and end-to-end diagrams |
| [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md) | Full list of 90+ current features (verified from code), competitor benchmark table, and 21 future feature ideas in 3 priority tiers |

---

## Quick Reference

### Key files

| File | Purpose |
|---|---|
| `app/shopify.server.js` | Shopify SDK init, billing plan config |
| `app/plans.server.js` | Plan limits and billing helpers |
| `app/email.server.js` | Nodemailer-based notification engine |
| `app/notification-defaults.js` | Default email template bodies and subjects |
| `app/db.server.js` | Prisma client singleton |
| `prisma/schema.prisma` | Database schema |
| `shopify.app.toml` | Shopify CLI config (webhooks, scopes, proxy) |
| `extensions/rentfic/blocks/app_embed.liquid` | Theme app embed block |
| `extensions/rentfic/assets/rentfic-booking.js` | Storefront booking widget |

### Plan limits at a glance

| Plan | Apartments | Analytics |
|---|---|---|
| Free | 1 | No |
| Pro ($19/mo) | Unlimited | No |
| Business ($49/mo) | Unlimited | Yes |

### Booking status lifecycle

```
pending  →  confirmed  →  (completed)
   ↓              ↓
cancelled       cancelled
```

- `pending`: Created by widget at booking time (before order)
- `confirmed`: Set by `orders/create` webhook or manual admin creation
- `cancelled`: Set by admin action (triggers cancellation emails)
- `completed`: Set manually or by future automation

### App proxy base URL

```
https://{shop_domain}/apps/rentfic/{path}
```

Proxied to: `https://rentfic-dev.onrender.com/api/proxy/{path}`
