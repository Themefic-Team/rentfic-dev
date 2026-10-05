# 07 — Booking
**Last Updated:** 2026-10-05

> Routes: `app/routes/app.booking._index.jsx`, `app/routes/app.booking.calendar.jsx`, `app/routes/app.booking.$id.jsx`, `app/routes/app.booking.new.jsx` | Menu: Booking

## Bookings List (`app.booking._index.jsx`)

### Views
- **List View**: Table with sortable columns — Order, Guest, Apartment, Check-in, Check-out, Nights, Total, Deposit, Status, Actions.
- **Calendar View**: Monthly calendar (switches to `app.booking.calendar.jsx`).

### Filters & Search
- **Search**: by order reference, product name, or guest name (server-side query).
- **Status Tabs**: All, Open (pending/confirmed), Complete, Cancelled.
- **Time Filter**: All Time, Future Bookings, Past Bookings, This Month, Last Month.

### Actions
- **Export CSV**: downloads all bookings as CSV via `api.export.bookings`.
- **Export iCal**: downloads `.ics` file for calendar apps.
- **Sync Orders**: calls the action to backfill Shopify order links and tags for unlinked bookings.
- **New Booking**: navigates to `app.booking.new`.

### Order Sync
- On loader, the app automatically back-fills `orderId` for bookings that have a matching Shopify order (matched by customer email + product ID + date in order properties).
- Also back-fills the `rentfic` tag on Shopify orders via `tagsAdd` mutation.

### Balance Invoice
- If a booking has a deposit and `balanceStatus = "pending"`, the table shows a "Send Invoice" button.
- This calls the action which creates a Shopify Draft Order for the remaining balance.
- Sets `draftOrderId` and `balanceStatus = "invoiced"` on the booking.

---

## Calendar View (`app.booking.calendar.jsx`)

- Monthly grid calendar showing bookings as coloured event bars.
- Each rental gets a unique colour (generated from its ID).
- Navigate via `?month=YYYY-MM` query param.
- Sidebar shows a colour legend per rental.

---

## Booking Detail (`app.booking.$id.jsx`)

Full detail page for a single booking. Read and edit.

### Sections
- **Header**: Order number, status badge, created date.
- **Guest Info**: Name, email (editable).
- **Dates**: Check-in, check-out, nights (editable).
- **Pricing**: Total price, deposit, balance. Calculated breakdown shown.
- **Status**: Dropdown — pending / confirmed / cancelled.
- **Notes**: Free-text notes field.
- **Balance Invoice**: Send invoice button if balance outstanding.
- **Linked Order**: Link to the Shopify order in admin.

---

## New Booking (`app.booking.new.jsx`)

Manual booking form for the merchant.

### Fields
- Select Rental (dropdown of active apartments)
- Guest name + email
- Dates (check-in / check-out)
- Nights (auto-calculated)
- Total price (auto-calculated from rental pricing rules)
- Deposit amount
- Notes
- Status

On submit, creates a `Booking` record directly in the DB (no Shopify order involved).
