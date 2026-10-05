# 06 — Global Settings
**Last Updated:** 2026-10-05

> Route: `app/routes/app.settings.jsx` | Menu: Global Settings
> Stored in: `Shop.settings` (JSON blob)

## Fields

### General

| Field | Key in `settings` | Type | Default | Description |
|---|---|---|---|---|
| Timezone | `timezone` | string | `"Asia/Dhaka"` | IANA timezone. Affects how dates/times display in widget and emails. Rendered via `TimezoneSelect` component. |
| Time Format | `timeFormat` | `"12"` / `"24"` | `"12"` | 12-hour or 24-hour clock display on widget. |
| Translate | `translate` | string | `"automatic"` | Language for the widget UI. `"automatic"` detects the browser language. |
| Redirect after Add to Cart | `redirectAfterCart` | string | `"automatic"` | Where customer goes after adding to cart: `"automatic"` (default Shopify behavior), `"cart"`, or `"checkout"`. |
| Display Calendar | `displayCalendar` | string | `"always_open"` | Whether the calendar widget is always expanded or toggled by a button. Options: `"always_open"`, `"click_to_open"`. |

### Block Dates on Store

| Field | Key | Type | Description |
|---|---|---|---|
| Blocked Dates | `blockedDates` | `string[]` | Array of `YYYY-MM-DD` strings. Applies globally across all rentals — customers cannot book on these dates. |

Use cases: store holidays, maintenance periods, local events.

### Deposit Settings

| Field | Key | Type | Default | Description |
|---|---|---|---|---|
| Deposit Type | `depositType` | `"percent"` / `"flat"` | `"percent"` | Whether the deposit is a percentage of total or a flat fee. |
| Deposit Value | `depositValue` | number | `""` | Percentage (0–100) or flat amount in store currency. `0` or empty means no deposit. |

**How deposit works**: When a customer checks out, the Shopify product variant price is dynamically set to the deposit amount. The remaining balance is collected later via a Shopify Draft Order (generated from the Bookings page).

## Save Behaviour
- Uses Shopify App Bridge `SaveBar` — the save bar only appears when unsaved changes are detected.
- Uses `useMemo` to compute `isDirty` by comparing current state vs. loaded settings.
- On submit, all fields are posted as `FormData`. The action writes the entire `settings` blob back to `Shop.settings`.
- Toast: "Settings saved" shown via `shopify.toast.show()` after successful submission.
