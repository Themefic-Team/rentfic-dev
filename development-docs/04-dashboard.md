# 04 — Dashboard
**Last Updated:** 2026-10-05

> Route: `app/routes/app._index.jsx` | Menu: Dashboard

## Overview

The Dashboard is the landing page of the embedded app. It gives the merchant a quick operational overview.

## Sections

### App Embed Status Banner
- Checks if the Rentfic Theme App Extension is active on the merchant's live theme.
- **How it works**: Calls the Shopify Admin REST API (`/admin/api/2024-10/themes.json`) to get the active theme ID, then fetches the theme's asset (`config/settings_data.json`) and checks if the app embed block key is enabled.
- **States**:
  - 🟡 Warning banner → "Enable App Embed" button links directly to the Theme Editor App Embeds tab with the Rentfic block pre-highlighted.
  - 🟢 Success banner → "Manage in Theme Editor" link.
- **Auto-polling**: Once the merchant clicks "Enable App Embed", the dashboard starts polling the loader every 4 seconds until `isEmbedEnabled` flips to `true`.

### Plan Card
- Uses the shared `PlanCard` component.
- Shows current plan, rental bookings used/total, progress bar, upgrade link.

### Overview Stats (4 cards)
| Stat | Source |
|---|---|
| Total Bookings | `COUNT(*)` from `Booking` where `shop` |
| Active Rentals | `COUNT(*)` from `Apartment` where `shop AND status = active` |
| Revenue This Month | `SUM(totalPrice)` from `Booking` where `status != cancelled AND createdAt in current month` |
| Avg. Duration / Stay | Average `nights` across last 20 non-cancelled bookings |

### Recent Bookings Table
- Shows the last 5 non-cancelled bookings.
- Columns: Order, Guest, Rental, Check-in, Nights, Status.
- "View All Bookings →" links to `/app/booking`.

## Loader Data Shape
```javascript
{
  appPlan,        // "free" | "pro" | "business"
  listingCount,   // number of apartments
  listingLimit,   // number or null (unlimited)
  renewalDate,    // null (not fetched on dashboard)
  stats: {
    totalBookings,
    activeApartments,
    revenueThisMonth,
    newBookingsThisMonth,
    cancellationsThisMonth,
    avgNights,
  },
  recentBookings,   // last 5 bookings
  isEmbedEnabled,   // boolean
  embedCheckError,  // string | null
  shopifyApiKey,    // for theme editor deep-link
  shop,             // shopify domain
}
```
