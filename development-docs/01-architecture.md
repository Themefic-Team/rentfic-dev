# 01 — Architecture
**Last Updated:** 2026-10-05

## Table of Contents
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Request Lifecycle](#request-lifecycle)
- [Authentication](#authentication)
- [Environment Variables](#environment-variables)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React Router v7 (formerly Remix) | `^7.12.0` |
| Shopify SDK | `@shopify/shopify-app-react-router` | `^1.1.0` |
| UI Library | Shopify Polaris | `^13.9.5` |
| App Bridge | `@shopify/app-bridge-react` | `^4.2.4` |
| ORM | Prisma | `^6.16.3` |
| Database | PostgreSQL | (hosted, via `DATABASE_URL`) |
| Email | Nodemailer | `^8.0.11` |
| Build Tool | Vite | `^6.3.6` |
| Runtime | Node.js | `>=20.19 <22 \|\| >=22.12` |

---

## Folder Structure

```
rentfic-dev/
├── app/
│   ├── routes/               # All React Router route files
│   │   ├── app.jsx           # Root layout: auth, nav, Polaris provider
│   │   ├── app._index.jsx    # Dashboard
│   │   ├── app.apartments.*  # Rentals list + edit
│   │   ├── app.booking.*     # Bookings list, calendar, detail, new
│   │   ├── app.settings.jsx  # Global Settings
│   │   ├── app.notifications.jsx # Notifications config
│   │   ├── app.subscribtion.jsx  # Subscription / billing
│   │   ├── app.analytics.jsx # Analytics (Business plan only)
│   │   ├── api.proxy.*       # Storefront proxy endpoints (public)
│   │   └── webhooks.*        # Shopify webhook handlers
│   ├── components/
│   │   ├── PlanCard.jsx      # Reusable plan status banner
│   │   └── TimezoneSelect.jsx
│   ├── email.server.js       # Nodemailer send logic (server-only)
│   ├── notification-defaults.js # Default email templates
│   ├── plans.server.js       # Plan limits + billing plan config
│   ├── shopify.server.js     # Shopify app auth initialization
│   └── db.server.js          # Prisma client singleton
├── prisma/
│   └── schema.prisma         # Database models
├── extensions/               # Shopify Theme App Extension (storefront widget)
├── development-docs/         # This folder
└── .agents/                  # AI agent skills
```

---

## Request Lifecycle

### Admin (Embedded App) Requests
```
Shopify Admin (iframe)
  → React Router route (app.*.jsx)
    → loader/action calls authenticate.admin(request)
      → Shopify validates session token
        → DB queries via Prisma
          → Returns JSON to React component
```

### Storefront Proxy Requests
```
Storefront (customer browser)
  → Shopify App Proxy (/apps/rentfic/*)
    → api.proxy.*.jsx
      → authenticate.public.appProxy(request)
        → DB queries via Prisma
          → Returns JSON to widget JS
```

---

## Authentication

- **Embedded auth** is handled by `authenticate.admin(request)` from `@shopify/shopify-app-react-router/server`.
- Sessions are stored in PostgreSQL via `@shopify/shopify-app-session-storage-prisma`.
- The root layout `app.jsx` runs a loader that syncs shop details (name, email, timezone, currency) into the `Shop` table on every page load.
- **Important:** Never use `reloadDocument` on form submissions inside the embedded iframe — it breaks third-party cookie access and causes infinite auth redirect loops.

---

## Environment Variables

| Variable | Description |
|---|---|
| `SHOPIFY_API_KEY` | App API key from Partners Dashboard |
| `SHOPIFY_API_SECRET` | App API secret |
| `SCOPES` | Requested OAuth scopes |
| `DATABASE_URL` | PostgreSQL connection string |
| `SHOPIFY_APP_URL` | Public tunnel URL (set by Shopify CLI) |
