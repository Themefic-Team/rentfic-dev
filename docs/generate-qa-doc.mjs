/**
 * Generates docs/QA_TESTING.docx from structured data.
 * Run: node docs/generate-qa-doc.mjs
 */

import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType, convertInchesToTwip, TableLayoutType,
} from "docx";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

// ─── Colour palette ──────────────────────────────────────────────────────────
const C = {
  headerBg:   "1a5276",   // dark blue
  headerFg:   "FFFFFF",
  sectionBg:  "2e86c1",   // mid blue
  sectionFg:  "FFFFFF",
  altRow:     "EBF5FB",
  white:      "FFFFFF",
  black:      "1C2833",
  green:      "1E8449",
  red:        "C0392B",
  orange:     "D35400",
  gray:       "717D7E",
  lightGray:  "F2F3F4",
  codeBg:     "EAECEE",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pt(size) { return size * 2; } // half-points

function cell(text, opts = {}) {
  const {
    bold = false, color = C.black, bg = C.white,
    align = AlignmentType.LEFT, width, italic = false,
    size = 9, colspan = 1,
  } = opts;

  return new TableCell({
    columnSpan: colspan,
    shading: { type: ShadingType.SOLID, color: bg, fill: bg },
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: align,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text, bold, color, italics: italic, size: pt(size), font: "Calibri" }),
        ],
      }),
    ],
  });
}

function hCell(text, width) {
  return cell(text, { bold: true, color: C.headerFg, bg: C.headerBg, width, size: 9 });
}

function statusCell(s = "☐") {
  const color = s === "✅" ? C.green : s === "❌" ? C.red : s === "⚠️" ? C.orange : C.gray;
  return cell(s, { align: AlignmentType.CENTER, color, bold: s !== "☐", width: 6, size: 10 });
}

function tableRow(cells, isAlt = false) {
  return new TableRow({
    children: cells,
    cantSplit: true,
  });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
    children: [
      new TextRun({ text, bold: true, color: C.sectionBg, size: pt(13), font: "Calibri" }),
    ],
  });
}

function subHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [
      new TextRun({ text, bold: true, color: C.black, size: pt(11), font: "Calibri" }),
    ],
  });
}

function para(text, opts = {}) {
  const { bold = false, italic = false, color = C.black, size = 10 } = opts;
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, bold, italic, color, size: pt(size), font: "Calibri" })],
  });
}

function blankLine() {
  return new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun({ text: "" })] });
}

function buildTestTable(headerRow, rows) {
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:           { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      bottom:        { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      left:          { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      right:         { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      insideH:       { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      insideV:       { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
    },
    rows: [
      new TableRow({ tableHeader: true, children: headerRow }),
      ...rows.map((r, i) =>
        new TableRow({
          children: r,
          cantSplit: true,
        })
      ),
    ],
  });
}

// ─── Legend table ─────────────────────────────────────────────────────────────
function legendTable() {
  const items = [
    ["☐", "Not tested yet"],
    ["✅", "Pass"],
    ["❌", "Fail"],
    ["⚠️", "Pass with issue (note required)"],
    ["⏭️", "Skipped / Not applicable"],
  ];
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      left:   { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      right:  { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
    },
    rows: [
      new TableRow({ tableHeader: true, children: [hCell("Symbol", 20), hCell("Meaning", 80)] }),
      ...items.map(([sym, meaning], i) => new TableRow({
        children: [
          cell(sym, { align: AlignmentType.CENTER, bg: i % 2 ? C.altRow : C.white, bold: true }),
          cell(meaning, { bg: i % 2 ? C.altRow : C.white }),
        ],
      })),
    ],
  });
}

// ─── Generic test section builder ─────────────────────────────────────────────
function testSection(title, cols, rows) {
  // cols: [{ label, width }]
  const header = cols.map(c => hCell(c.label, c.width));
  const dataRows = rows.map((r, i) =>
    new TableRow({
      children: r.map((val, ci) => {
        if (ci === cols.length - 2) return statusCell(val); // second-to-last = status
        const bg = i % 2 ? C.altRow : C.white;
        return cell(val, { bg, size: 9 });
      }),
      cantSplit: true,
    })
  );
  return [
    blankLine(),
    sectionHeading(title),
    buildTestTable(header, dataRows),
  ];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const COL_TEST = [
  { label: "#",       width: 5  },
  { label: "Test Case", width: 40 },
  { label: "Expected Result", width: 35 },
  { label: "Status", width: 7  },
  { label: "Notes",  width: 13 },
];

const COL_CR = [
  { label: "#",     width: 7  },
  { label: "Item",  width: 70 },
  { label: "Status",width: 7  },
  { label: "Notes", width: 16 },
];

function tr(...vals) { return [...vals, "☐", ""]; }
function cr(...vals) { return [...vals, "☐", ""]; }

const SECTIONS = [
  {
    title: "Section 1 — Installation & Boot",
    rows: [
      tr("1.1", "Install app on dev store via `shopify app dev`", "Redirects to Dashboard without error"),
      tr("1.2", "Dashboard loads without blank screen", "Page renders with nav and stats"),
      tr("1.3", "All nav links work", "Dashboard · Apartments · Settings · Bookings · Notifications · Subscription all navigate"),
      tr("1.4", "Shop record created in DB on first load", "Row exists with plan = 'free', shop domain, name, email"),
      tr("1.5", "Plan card visible on Dashboard", "Shows '✦ Free Plan · 0 of 1 apartment used'"),
      tr("1.6", "Plan card visible on all pages", "Appears on Apartments, Settings, Bookings, Notifications"),
      tr("1.7", "Session expiry shows login form", "'Shop domain' login box appears, not a crash"),
      tr("1.8", "Re-login from session expiry", "Enter shop domain → returns to app at correct page"),
    ],
  },
  {
    title: "Section 2 — Global Settings",
    rows: [
      tr("2.1",  "Settings page loads with saved values", "Fields show previously saved data on reload"),
      tr("2.2",  "Save button shows success toast", "Green toast appears after save"),
      tr("2.3",  "Discard reverts unsaved changes", "Fields reset to last saved values"),
      tr("2.4",  "Display Calendar = Always Open", "Widget shows calendar immediately on product page"),
      tr("2.5",  "Display Calendar = Default (toggle)", "Widget shows 'Show dates' button; calendar hidden until clicked"),
      tr("2.6",  "Start Calendar = First Available Date", "Calendar opens on first non-blocked, non-past date"),
      tr("2.7",  "Redirect after cart = Checkout", "After reserve → goes to /checkout"),
      tr("2.8",  "Redirect after cart = Cart", "After reserve → goes to /cart"),
      tr("2.9",  "Redirect after cart = Disabled", "After reserve → shows inline 'Booking reserved!' message"),
      tr("2.10", "From Price = Automatic", "Widget header shows 'From $X / night' prefix"),
      tr("2.11", "From Price = Disabled", "Price hidden from widget header"),
      tr("2.12", "Quantity position = Product page only", "Quantity stepper not shown inside widget calendar area"),
      tr("2.13", "Quantity position = Product + Calendar", "Quantity stepper visible in widget"),
      tr("2.14", "Global blocked dates applied in widget", "Globally blocked dates not selectable on any apartment"),
    ],
  },
  {
    title: "Section 3 — Apartment Creation",
    rows: [
      tr("3.1",  "Click 'Create Apartment' → resource picker opens", "Shopify product picker appears"),
      tr("3.2",  "Selecting a product pre-fills name and title", "Name field and productTitle populated"),
      tr("3.3",  "Selecting already-linked product shows error", "Toast: 'An apartment already exists for this product'"),
      tr("3.4",  "Save apartment with all required fields", "Redirects to apartment list, apartment visible"),
      tr("3.5",  "SaveBar appears on field change", "SaveBar with Save / Discard appears when any field edited"),
      tr("3.6",  "Edit existing apartment and save", "Changes persisted on reload"),
      tr("3.7",  "Delete apartment from list", "Apartment removed, Shopify metafield reset"),
      tr("3.8",  "Apartment status = inactive", "Widget does not render on product page"),
      tr("3.9",  "Booking type: Single day", "Calendar allows one date at a time"),
      tr("3.10", "Booking type: Date range", "Calendar allows start → end range selection"),
      tr("3.11", "Booking type: Multiple days", "Individual days toggle on/off"),
      tr("3.12", "Min nights enforced on range", "Cannot select end date < minDays nights away"),
      tr("3.13", "Max nights enforced on range", "Cannot select end date > maxDays nights away"),
      tr("3.14", "Max days enforced on multiple", "Cannot select more days than maxDays"),
      tr("3.15", "Weekly availability — disable a day", "That weekday greyed/blocked in widget"),
      tr("3.16", "Calendar start/end date bounds", "Dates outside bounds are greyed out"),
      tr("3.17", "Blocked dates from apartment settings", "Specific dates greyed and unclickable"),
      tr("3.18", "Amenities save and display", "Amenity tags saved in settings JSON"),
      tr("3.19", "Additional fee — flat per booking", "Fee shows in widget price breakdown"),
      tr("3.20", "Additional fee — flat per night", "Fee × nights shows in widget price breakdown"),
      tr("3.21", "Additional fee — percentage of base", "Fee = base × % shows in breakdown"),
      tr("3.22", "Conditional discount — minDays met", "Discount line appears, total reduced"),
      tr("3.23", "Conditional discount — minDays NOT met", "No discount line shown"),
      tr("3.24", "Conditional discount — minTotal met", "Discount fires when base price ≥ threshold"),
      tr("3.25", "Deposit enabled — percent", "Deposit line shows in price breakdown"),
      tr("3.26", "Deposit enabled — fixed amount", "Fixed deposit amount shows in breakdown"),
      tr("3.27", "Create 2nd apartment on Free plan", "Shows 'Apartment limit reached' screen with upgrade link"),
      tr("3.28", "'Create Apartment' button when at limit", "Button shows 'Plan Limit Reached' and is disabled"),
      tr("3.29", "Plan card bar turns red when at limit", "Progress bar fills red at 1/1"),
      tr("3.30", "Upgrade link goes to Subscription page", "Clicking 'Upgrade to add more' navigates to /app/subscribtion"),
    ],
  },
  {
    title: "Section 4 — Storefront Widget",
    rows: [
      tr("4.1",  "Widget loads on linked product page", "Calendar and booking form appear on storefront"),
      tr("4.2",  "Widget absent on non-linked product", "No widget HTML injected"),
      tr("4.3",  "Widget shows error state on API failure", "Red error box with message (no blank widget)"),
      tr("4.4",  "Past dates are greyed and unclickable", "Dates before today cannot be selected"),
      tr("4.5",  "Blocked dates are greyed", "Individual blocked dates unclickable"),
      tr("4.6",  "Price breakdown shows base price", "nights × price row visible"),
      tr("4.7",  "Price breakdown shows fees", "Each additional fee listed with computed amount"),
      tr("4.8",  "Price breakdown shows discount", "Discount row with negative value when rule met"),
      tr("4.9",  "Guest selector: adults default = 1", "Adults starts at 1, cannot go below 1"),
      tr("4.10", "Guest selector: children default = 0", "Children/Infants start at 0"),
      tr("4.11", "Max adults limit enforced", "+ button ignored at maxAdults"),
      tr("4.12", "Max guests total enforced", "Total capped at maxGuests"),
      tr("4.13", "Quantity stepper min = 1", "Cannot go below 1"),
      tr("4.14", "Quantity stepper max = stockQuantity", "Cannot exceed stock count"),
      tr("4.15", "Calendar month navigation", "Month changes correctly, no jump errors"),
      tr("4.16", "Range hover preview", "Hovering over end date shows range highlight"),
      tr("4.17", "Clicking new start date resets range", "Previous selection cleared, new start set"),
      tr("4.18", "Check-in / check-out times displayed", "Times show in widget if configured"),
    ],
  },
  {
    title: "Section 5 — Reserve Flow (Critical Path)",
    rows: [
      tr("5.1",  "Reserve Now with no date selected", "Button does nothing / disabled"),
      tr("5.2",  "Reserve Now sends POST to /apps/rentfic/booking", "Network tab shows correct request"),
      tr("5.3",  "Server-side total matches widget total", "finalTotal in response equals widget displayed total"),
      tr("5.4",  "Booking created in DB with status = 'pending'", "Check Booking table after reserve"),
      tr("5.5",  "Shopify variant price updated to booking total", "Product variant price = finalTotal after reserve"),
      tr("5.6",  "Cart item has _booking_id line item property", "Check cart JSON for _booking_id"),
      tr("5.7",  "Date conflict detection", "Same dates on same apartment → 409 'no longer available'"),
      tr("5.8",  "Stock quantity conflict detection", "Reserve more units than available → error message"),
      tr("5.9",  "Reserve redirects to checkout (default)", "Browser navigates to /checkout"),
      tr("5.10", "Reserve redirects to cart (setting)", "Browser navigates to /cart"),
      tr("5.11", "Reserve shows success message (disabled)", "Inline 'Booking reserved!' message, no page nav"),
      tr("5.12", "Pending booking blocks same dates", "Second attempt fails with conflict error"),
      tr("5.13", "Multiple quantity reserve works", "2 units reserved, remaining = stock - 2"),
    ],
  },
  {
    title: "Section 6 — Order Webhook & Booking Confirmation",
    rows: [
      tr("6.1", "Complete checkout on Shopify", "orders/create webhook fires"),
      tr("6.2", "Booking status changes to 'confirmed'", "Bookings page shows 'confirmed' badge with order number"),
      tr("6.3", "Booking gets customerName and customerEmail", "Fields populated from Shopify order"),
      tr("6.4", "Booking gets orderId and orderNumber", "#1001 format visible in Bookings page"),
      tr("6.5", "Confirmation email sent to guest", "Email arrives (SMTP) or Ethereal preview logged"),
      tr("6.6", "Owner alert email sent", "Email sent to shop owner email address"),
      tr("6.7", "Order without _booking_id property", "Webhook returns 200 silently, no DB changes"),
      tr("6.8", "Duplicate webhook delivery", "Second delivery is idempotent (no double-email)"),
    ],
  },
  {
    title: "Section 7 — Bookings Dashboard",
    rows: [
      tr("7.1",  "Bookings page lists all bookings", "All pending + confirmed + cancelled bookings visible"),
      tr("7.2",  "Status tabs filter correctly", "'Pending' tab shows only pending, counts match"),
      tr("7.3",  "Search by guest name", "Filters list to matching guest"),
      tr("7.4",  "Search by apartment name", "Filters to matching apartment"),
      tr("7.5",  "Search by order ID (#1001)", "Filters to that order"),
      tr("7.6",  "Search by email address", "Filters to bookings from that email"),
      tr("7.7",  "Status badge colors correct", "Pending=yellow, Confirmed=green, Cancelled=red"),
      tr("7.8",  "Pending booking shows partial order ID", "Shows …abc123 (last 6 chars of booking ID)"),
      tr("7.9",  "Confirmed booking shows real order number", "Shows #1001 format"),
      tr("7.10", "Plan card visible at top", "Free/Pro plan card renders"),
    ],
  },
  {
    title: "Section 8 — Notifications",
    rows: [
      tr("8.1",  "Notifications page loads all 7 tabs", "All tabs clickable: Booking Confirmation, Reminder, etc."),
      tr("8.2",  "Default template content pre-filled", "Subject and body populated from defaults"),
      tr("8.3",  "Toggle enable/disable template", "Toggle saves and persists on reload"),
      tr("8.4",  "Edit subject line → save → reload", "Custom subject persists"),
      tr("8.5",  "Edit body text → save → reload", "Custom body persists"),
      tr("8.6",  "Template variables shown in sidebar", "{{product.name}}, {{start}}, etc. listed"),
      tr("8.7",  "Send test email (no SMTP)", "Server console shows Ethereal preview URL"),
      tr("8.8",  "Open Ethereal preview URL", "Email rendered correctly in browser"),
      tr("8.9",  "Template variables resolved in test email", "{{customer.firstName}} → 'Jane', etc."),
      tr("8.10", "Send test email (with SMTP)", "Real email arrives in inbox"),
      tr("8.11", "SMTP config saves and persists", "Host, port, user, from name persist on reload"),
      tr("8.12", "Switch from SMTP back to Default", "Ethereal fallback resumes"),
      tr("8.13", "Disabled template not sent", "Toggle off → real send skipped"),
      tr("8.14", "Cron endpoint POST /api/reminders", "Returns 200 with correct secret header"),
      tr("8.15", "Cron endpoint rejects wrong secret", "Returns 401 with wrong/missing x-cron-secret"),
      tr("8.16", "Reminder deduplication", "Running cron twice same day does not send duplicates"),
    ],
  },
  {
    title: "Section 9 — Subscription & Plan Enforcement",
    rows: [
      tr("9.1",  "Subscription page shows current plan from DB", "'Free Plan' shown for new install"),
      tr("9.2",  "Apartment usage count is live", "Shows correct count matching apartment list"),
      tr("9.3",  "Feature comparison table correct", "Free: 1 apt, notifications ✓, analytics ✗"),
      tr("9.4",  "Click 'Upgrade to Pro'", "Redirects to Shopify payment confirmation page"),
      tr("9.5",  "Complete test payment", "app_subscriptions/update webhook fires"),
      tr("9.6",  "DB Shop.plan updated to 'pro' after payment", "Check DB directly"),
      tr("9.7",  "Subscription page shows Pro plan after upgrade", "'Pro Plan' badge, renewal date visible"),
      tr("9.8",  "Plan card across all pages shows Pro", "All pages show '✦ Pro Plan'"),
      tr("9.9",  "Pro plan: can create unlimited apartments", "2nd, 3rd apartment creation succeeds"),
      tr("9.10", "Renewal date shown for paid plan", "'Renews June 13, 2026' visible in plan card"),
      tr("9.11", "Cancel subscription", "Webhook updates plan → 'free' in DB"),
      tr("9.12", "After cancel: apartment limit re-enforced", "If >1 apartment exists, creation blocked again"),
      tr("9.13", "Shopify store plan does NOT overwrite app plan", "Layout reload does not reset plan to 'Basic Shopify'"),
    ],
  },
  {
    title: "Section 10 — Plan Card Component",
    rows: [
      tr("10.1", "Free plan — 0 apartments used", "Bar empty, green, '0 of 1 apartment used'"),
      tr("10.2", "Free plan — 1 apartment used (at limit)", "Bar full, RED, '1 of 1', 'Upgrade to add more →'"),
      tr("10.3", "Pro plan card color", "Green badge '✦ Pro Plan'"),
      tr("10.4", "Business plan card color", "Purple badge '✦ Business Plan'"),
      tr("10.5", "Pro/Business shows 'Unlimited'", "No bar, shows apartment count + 'Unlimited'"),
      tr("10.6", "Pro/Business shows renewal date", "'Renews [Month DD, YYYY]' visible"),
      tr("10.7", "'Manage →' link for paid plans", "Navigates to /app/subscribtion"),
      tr("10.8", "'Upgrade plan →' link for free plan", "Navigates to /app/subscribtion"),
      tr("10.9", "Card not shown if layout data unavailable", "Component returns null gracefully"),
    ],
  },
];

const CR_SECTIONS = [
  {
    title: "11.1 Security",
    rows: [
      cr("CR-S1", "All admin routes use authenticate.admin(request)"),
      cr("CR-S2", "All proxy routes use authenticate.public.appProxy(request)"),
      cr("CR-S3", "All webhook routes use authenticate.webhook(request)"),
      cr("CR-S4", "Cron endpoint protected by x-cron-secret header"),
      cr("CR-S5", "No raw SQL queries — all through Prisma ORM"),
      cr("CR-S6", "No secrets committed to git (.env in .gitignore)"),
      cr("CR-S7", "SMTP password not exposed in API responses"),
      cr("CR-S8", "Booking data scoped by shop — no cross-tenant leakage"),
      cr("CR-S9", "All DB queries filter by shop: session.shop"),
      cr("CR-S10","isTest: true removed from billing calls before production"),
    ],
  },
  {
    title: "11.2 Data Integrity",
    rows: [
      cr("CR-D1", "Shop.plan never overwritten by layout loader (only on create)"),
      cr("CR-D2", "Booking status transitions: pending → confirmed only via webhook"),
      cr("CR-D3", "Server-side total calculation mirrors widget calculation"),
      cr("CR-D4", "Conflict check runs before booking creation"),
      cr("CR-D5", "NotificationLog prevents duplicate reminder emails"),
      cr("CR-D6", "prisma.shop.upsert safe for concurrent first loads"),
      cr("CR-D7", "Variant price reset after booking (resetPrice returned to widget)"),
    ],
  },
  {
    title: "11.3 Error Handling",
    rows: [
      cr("CR-E1", "Widget shows user-friendly error if API fails (not blank)"),
      cr("CR-E2", "Booking route returns proper HTTP status codes (409/404/400)"),
      cr("CR-E3", "Email send failure does not break order webhook (try/catch)"),
      cr("CR-E4", "billing.check() wrapped in try/catch"),
      cr("CR-E5", "Shop GraphQL sync failure is non-fatal (console.error, no throw)"),
      cr("CR-E6", "Webhook handler returns 200 even when booking not found"),
      cr("CR-E7", "Ethereal account cached (not re-created on every email send)"),
    ],
  },
  {
    title: "11.4 Performance",
    rows: [
      cr("CR-P1", "App layout loader uses Promise.all for parallel DB queries"),
      cr("CR-P2", "Apartment proxy API uses Promise.all for apartment + shop fetch"),
      cr("CR-P3", "No N+1 queries in bookings list loader"),
      cr("CR-P4", "Prisma indexes on shop, apartmentId, orderId fields"),
      cr("CR-P5", "Widget only mounts on product pages (URL match check)"),
    ],
  },
  {
    title: "11.5 Code Quality",
    rows: [
      cr("CR-Q1", "No unused imports (check IDE diagnostics)"),
      cr("CR-Q2", "Plan limits centralised in plans.server.js"),
      cr("CR-Q3", "Email templates centralised in notification-defaults.js"),
      cr("CR-Q4", "PlanCard uses useRouteLoaderData (no duplicate fetching)"),
      cr("CR-Q5", "Widget price calculation exactly mirrors server calcTotal"),
      cr("CR-Q6", "Webhook files named to match Shopify topic"),
      cr("CR-Q7", "No console.log left in production paths (only console.error)"),
    ],
  },
];

const PREPROD = [
  cr("P1",  "SHOPIFY_APP_URL set to real production domain"),
  cr("P2",  "DATABASE_URL points to production PostgreSQL"),
  cr("P3",  "npx prisma db push run on production DB"),
  cr("P4",  "SMTP_HOST, SMTP_USER, SMTP_PASS set in production env"),
  cr("P5",  "CRON_SECRET set to strong random string"),
  cr("P6",  "Daily cron job scheduled to POST /api/reminders with x-cron-secret header"),
  cr("P7",  "isTest: true removed from billing.request() in app.subscribtion.jsx"),
  cr("P8",  "isTest: true removed from billing.check() in app.subscribtion.jsx"),
  cr("P9",  "isTest: true removed from billing.cancel() in app.subscribtion.jsx"),
  cr("P10", "shopify app deploy run to register webhooks in production"),
  cr("P11", "All 3 webhooks confirmed registered in Partner Dashboard"),
  cr("P12", "App listing info complete in Partner Dashboard"),
  cr("P13", "Theme extension published and enabled in Online Store"),
  cr("P14", "Test a real end-to-end booking on production store"),
  cr("P15", "Confirmation email arrives in real inbox"),
];

// ─── Summary table ────────────────────────────────────────────────────────────

function summaryTable() {
  const rows = [
    ["1 — Installation",        "8"],
    ["2 — Global Settings",     "14"],
    ["3 — Apartment Creation",  "30"],
    ["4 — Storefront Widget",   "18"],
    ["5 — Reserve Flow",        "13"],
    ["6 — Order Webhook",       "8"],
    ["7 — Bookings Dashboard",  "10"],
    ["8 — Notifications",       "16"],
    ["9 — Subscription",        "13"],
    ["10 — Plan Card",          "9"],
    ["11 — Code Review",        "29"],
    ["12 — Pre-Production",     "15"],
    ["TOTAL",                   "183"],
  ];

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      left:   { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      right:  { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
    },
    rows: [
      new TableRow({ tableHeader: true, children: [
        hCell("Section", 50), hCell("Total", 12), hCell("Pass", 12), hCell("Fail", 12), hCell("Skipped", 14),
      ]}),
      ...rows.map(([sec, tot], i) => new TableRow({
        children: [
          cell(sec,  { bg: i % 2 ? C.altRow : C.white, bold: sec === "TOTAL", size: 9 }),
          cell(tot,  { bg: i % 2 ? C.altRow : C.white, align: AlignmentType.CENTER, bold: sec === "TOTAL", size: 9 }),
          cell("",   { bg: i % 2 ? C.altRow : C.white }),
          cell("",   { bg: i % 2 ? C.altRow : C.white }),
          cell("",   { bg: i % 2 ? C.altRow : C.white }),
        ],
      })),
    ],
  });
}

// ─── Assemble document ────────────────────────────────────────────────────────

function buildCrSection(title, rows) {
  const header = [hCell("#", 8), hCell("Item", 68), hCell("Status", 8), hCell("Notes", 16)];
  const dataRows = rows.map((r, i) => new TableRow({
    children: [
      cell(r[0], { bg: i % 2 ? C.altRow : C.white, bold: true, size: 9 }),
      cell(r[1], { bg: i % 2 ? C.altRow : C.white, size: 9 }),
      statusCell(r[2]),
      cell(r[3], { bg: i % 2 ? C.altRow : C.white, size: 9 }),
    ],
  }));
  return [
    blankLine(),
    subHeading(title),
    new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top:    { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
        left:   { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
        right:  { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
        insideH:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
        insideV:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
      },
      rows: [new TableRow({ tableHeader: true, children: header }), ...dataRows],
    }),
  ];
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: pt(10), color: C.black },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(0.75), bottom: convertInchesToTwip(0.75), left: convertInchesToTwip(0.75), right: convertInchesToTwip(0.75) },
      },
    },
    children: [
      // ── Title ──
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: "Rentfic — QA Testing & Code Review", bold: true, size: pt(20), color: C.headerBg, font: "Calibri" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: "Shopify Rental Booking App", size: pt(12), color: C.gray, font: "Calibri" })],
      }),

      // ── Meta table ──
      blankLine(),
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          left:   { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          right:  { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          insideH:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          insideV:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
        },
        rows: [
          new TableRow({ children: [
            cell("Tester",      { bold: true, bg: C.lightGray, width: 20 }),
            cell("",            { width: 30 }),
            cell("Environment", { bold: true, bg: C.lightGray, width: 20 }),
            cell("☐ Dev   ☐ Staging   ☐ Production", { width: 30 }),
          ]}),
          new TableRow({ children: [
            cell("Date Started",   { bold: true, bg: C.lightGray }),
            cell(""),
            cell("Date Completed", { bold: true, bg: C.lightGray }),
            cell(""),
          ]}),
          new TableRow({ children: [
            cell("Build / Commit", { bold: true, bg: C.lightGray }),
            cell("", { colspan: 3 }),
          ]}),
        ],
      }),

      // ── Legend ──
      blankLine(),
      sectionHeading("Legend"),
      legendTable(),

      // ── Test sections ──
      ...SECTIONS.flatMap(({ title, rows }) => {
        const header = COL_TEST.map(c => hCell(c.label, c.width));
        const dataRows = rows.map((r, i) => new TableRow({
          children: [
            cell(r[0], { bg: i % 2 ? C.altRow : C.white, bold: true,  size: 9, width: 5  }),
            cell(r[1], { bg: i % 2 ? C.altRow : C.white, size: 9, width: 40 }),
            cell(r[2], { bg: i % 2 ? C.altRow : C.white, size: 9, width: 35 }),
            statusCell(r[3]),
            cell(r[4], { bg: i % 2 ? C.altRow : C.white, size: 9, width: 13 }),
          ],
        }));
        return [
          blankLine(),
          sectionHeading(title),
          new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
              left:   { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
              right:  { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
              insideH:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
              insideV:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
            },
            rows: [new TableRow({ tableHeader: true, children: header }), ...dataRows],
          }),
        ];
      }),

      // ── Code Review ──
      blankLine(),
      sectionHeading("Section 11 — Code Review Checklist"),
      ...CR_SECTIONS.flatMap(s => buildCrSection(s.title, s.rows)),

      // ── Pre-production ──
      blankLine(),
      sectionHeading("Section 12 — Pre-Production Checklist"),
      ...buildCrSection("", PREPROD).slice(1), // skip the subheading for this one

      // ── Summary ──
      blankLine(),
      sectionHeading("Test Run Summary"),
      summaryTable(),

      // ── Bug report ──
      blankLine(),
      sectionHeading("Bug Report Template"),
      para("Copy and fill in one block per bug found during testing.", { italic: true, color: C.gray }),
      blankLine(),
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          left:   { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          right:  { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          insideH:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          insideV:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
        },
        rows: [
          ...[
            ["Bug #",               ""],
            ["Section",             "e.g. Section 5 — Reserve Flow"],
            ["Test Case",           "e.g. 5.7 — Date conflict detection"],
            ["Severity",            "Critical  /  High  /  Medium  /  Low"],
            ["Environment",         "Dev  /  Staging  /  Production"],
            ["Steps to Reproduce",  "1.\n2.\n3."],
            ["Expected Result",     ""],
            ["Actual Result",       ""],
            ["Screenshot / Error",  ""],
            ["Status",              "Open  /  In Progress  /  Fixed  /  Closed"],
            ["Fixed in Commit",     ""],
          ].map(([label, val], i) => new TableRow({
            children: [
              cell(label, { bold: true, bg: C.lightGray, width: 22, size: 9 }),
              cell(val,   { bg: i % 2 ? C.white : C.altRow, width: 78, size: 9 }),
            ],
          })),
        ],
      }),

      // ── Sign-off ──
      blankLine(),
      sectionHeading("Final Sign-off"),
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          left:   { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          right:  { style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          insideH:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
          insideV:{ style: BorderStyle.SINGLE, size: 1, color: "BDC3C7" },
        },
        rows: [
          new TableRow({ children: [cell("QA Tester", { bold: true, bg: C.lightGray, width: 25 }), cell("", { width: 40 }), cell("Date", { bold: true, bg: C.lightGray, width: 15 }), cell("", { width: 20 })] }),
          new TableRow({ children: [cell("Developer",  { bold: true, bg: C.lightGray }), cell(""), cell("Date", { bold: true, bg: C.lightGray }), cell("")] }),
          new TableRow({ children: [cell("Approved for Production", { bold: true, bg: C.lightGray }), cell("☐ Yes     ☐ No", { colspan: 3 })] }),
        ],
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
const outPath = join(__dir, "QA_TESTING.docx");
writeFileSync(outPath, buffer);
console.log(`✅  Generated: ${outPath}`);
