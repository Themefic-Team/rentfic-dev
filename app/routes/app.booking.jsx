import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PlanCard } from "../components/PlanCard";
import { Icon } from "@shopify/polaris";
import {
  SearchIcon,
  RefreshIcon,
  CalendarIcon,
  ChevronDownIcon,
  EmailIcon,
  CheckSmallIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@shopify/polaris-icons";

async function createDraftOrder(admin, booking, balanceAmount) {
  const dateLabel = booking.endDate && booking.endDate !== booking.startDate
    ? `${booking.startDate} to ${booking.endDate}`
    : booking.startDate;

  const res = await admin.graphql(`
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id invoiceUrl }
        userErrors { field message }
      }
    }
  `, {
    variables: {
      input: {
        lineItems: [{
          title: `Balance Due — ${booking.productTitle} (${dateLabel})`,
          quantity: 1,
          originalUnitPrice: balanceAmount.toFixed(2),
        }],
        ...(booking.customerEmail ? { email: booking.customerEmail } : {}),
        note: `Remaining balance for booking ${booking.id}. Total: $${booking.totalPrice?.toFixed(2)}, Deposit paid: $${booking.depositAmount?.toFixed(2)}`,
        tags: ["balance-due", "rentfic"],
      },
    },
  });
  const json = await res.json();
  return json?.data?.draftOrderCreate?.draftOrder ?? null;
}

// Runs once per server process per shop to backfill "rentfic" tag on already-linked orders
const taggedShops = new Set();
async function backfillOrderTags(admin, shop) {
  if (taggedShops.has(shop)) return;
  taggedShops.add(shop);

  const linked = await prisma.booking.findMany({
    where: { shop, orderId: { not: null } },
    select: { orderId: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  await Promise.all(linked.map((b) =>
    admin.graphql(`
      mutation tagsAdd($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          node { id }
          userErrors { field message }
        }
      }
    `, { variables: { id: `gid://shopify/Order/${b.orderId}`, tags: ["rentfic"] } }).catch(() => {})
  ));
}

async function syncUnlinkedBookings(admin, shop) {
  const unlinked = await prisma.booking.findMany({
    where: { shop, orderId: null },
    select: { id: true, depositAmount: true, totalPrice: true, productTitle: true,
              startDate: true, endDate: true, customerEmail: true, apartmentId: true },
  });
  if (!unlinked.length) return;

  const res = await admin.graphql(`
    query {
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            email
            billingAddress { firstName lastName }
            lineItems(first: 10) {
              edges { node { customAttributes { key value } } }
            }
          }
        }
      }
    }
  `);
  const json = await res.json();
  const orders = json?.data?.orders?.edges ?? [];

  const unlinkedMap = Object.fromEntries(unlinked.map((b) => [b.id, b]));

  await Promise.all(orders.map(async ({ node: order }) => {
    for (const { node: item } of order.lineItems.edges) {
      const attrs     = Object.fromEntries((item.customAttributes || []).map((a) => [a.key, a.value]));
      const bookingId = attrs["_booking_id"];
      const booking   = unlinkedMap[bookingId];
      if (!bookingId || !booking) continue;

      const numericId    = order.id.split("/").pop();
      const orderNumber  = order.name?.replace("#", "") || "";
      const customerName = [order.billingAddress?.firstName, order.billingAddress?.lastName].filter(Boolean).join(" ") || null;

      // Link the booking to the order
      const updated = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          orderId:       numericId,
          orderNumber,
          customerName:  customerName || undefined,
          customerEmail: order.email   || undefined,
          status:        "confirmed",
        },
      });

      // Tag the Shopify order with "rentfic"
      await admin.graphql(`
        mutation tagsAdd($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            node { id }
            userErrors { field message }
          }
        }
      `, { variables: { id: order.id, tags: ["rentfic"] } }).catch(() => {});

      // If deposit was paid and apartment has balanceAutoInvoice enabled, create draft order
      if (booking.depositAmount && booking.totalPrice && !updated.draftOrderId) {
        const apartment = await prisma.apartment.findFirst({
          where: { id: booking.apartmentId },
          select: { settings: true },
        });
        const autoInvoice = apartment?.settings?.balanceAutoInvoice ?? false;
        if (autoInvoice) {
          const balanceAmount = booking.totalPrice - booking.depositAmount;
          if (balanceAmount > 0) {
            const draft = await createDraftOrder(admin, {
              ...booking,
              customerEmail: order.email || booking.customerEmail,
            }, balanceAmount).catch(() => null);

            if (draft?.id) {
              await prisma.booking.update({
                where: { id: bookingId },
                data: {
                  draftOrderId:  draft.id,
                  draftOrderUrl: draft.invoiceUrl,
                  balanceStatus: "pending",
                },
              });
            }
          }
        }
      }
    }
  }));
}

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  // Sync any bookings that don't yet have an order linked
  await syncUnlinkedBookings(admin, session.shop).catch(() => {});
  await backfillOrderTags(admin, session.shop).catch(() => {});

  const bookings = await prisma.booking.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  const formatted = bookings.map((b) => {
    const balanceNum = (b.totalPrice != null && b.depositAmount != null)
      ? b.totalPrice - b.depositAmount : null;
    return {
      id:            b.id,
      guest:         b.customerName  || "—",
      email:         b.customerEmail || "",
      apartment:     b.productTitle  || "—",
      checkIn:       b.startDate,
      checkOut:      b.endDate,
      checkInFmt:    fmtDate(b.startDate),
      checkOutFmt:   fmtDate(b.endDate),
      nights:        b.nights ?? 1,
      total:         b.totalPrice != null ? fmtCurrency(b.totalPrice) : "—",
      depositAmount: b.depositAmount != null ? fmtCurrency(b.depositAmount) : null,
      balanceDue:    balanceNum != null && balanceNum > 0 ? fmtCurrency(balanceNum) : null,
      balanceStatus: b.balanceStatus || null,
      draftOrderId:  b.draftOrderId || null,
      draftOrderUrl: b.draftOrderUrl || null,
      status:        b.status,
      orderId:       b.orderNumber ? `#${b.orderNumber}` : `…${b.id.slice(-6)}`,
      orderNumber:   b.orderNumber,
      shopifyOrderId: b.orderId || null,
      quantity:      b.lineItemProperties?.quantity ?? 1,
      bookingType:   b.lineItemProperties?.bookingType ?? "range",
      createdAt:     b.createdAt,
    };
  });

  return { bookings: formatted, shop: session.shop };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const fd        = await request.formData();
  const intent    = fd.get("intent");
  const bookingId = fd.get("bookingId");

  if (intent === "bulk") {
    const ids   = JSON.parse(fd.get("ids"));
    const actionType = fd.get("bulkAction");

    if (actionType === "delete") {
      await prisma.booking.deleteMany({ where: { shop: session.shop, id: { in: ids } } });
    } else {
      await prisma.booking.updateMany({ where: { shop: session.shop, id: { in: ids } }, data: { status: actionType } });
    }
    return { success: true };
  }

  if (intent === "syncOrders") {
    const unlinked = await prisma.booking.findMany({
      where: { shop: session.shop, orderId: null },
      select: { id: true },
    });

    const res = await admin.graphql(`
      query {
        orders(first: 50, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id name email
              billingAddress { firstName lastName }
              lineItems(first: 10) {
                edges { node { customAttributes { key value } } }
              }
            }
          }
        }
      }
    `);
    const json = await res.json();
    const orders = json?.data?.orders?.edges ?? [];

    let linked = 0;
    const unlinkedIds = new Set(unlinked.map((b) => b.id));

    for (const { node: order } of orders) {
      for (const { node: item } of order.lineItems.edges) {
        const attrs     = Object.fromEntries((item.customAttributes || []).map((a) => [a.key, a.value]));
        const bookingId = attrs["_booking_id"];
        if (!bookingId || !unlinkedIds.has(bookingId)) continue;

        const numericId    = order.id.split("/").pop();
        const orderNumber  = order.name?.replace("#", "") || "";
        const customerName = [order.billingAddress?.firstName, order.billingAddress?.lastName].filter(Boolean).join(" ") || null;

        await prisma.booking.update({
          where: { id: bookingId },
          data: {
            orderId:       numericId,
            orderNumber,
            customerName:  customerName || undefined,
            customerEmail: order.email   || undefined,
            status:        "confirmed",
          },
        });

        await admin.graphql(`
          mutation tagsAdd($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } }
          }
        `, { variables: { id: order.id, tags: ["rentfic"] } }).catch(() => {});

        linked++;
        unlinkedIds.delete(bookingId);
      }
    }

    return {
      success: true,
      syncResult: {
        shopifyOrders: orders.length,
        unlinkedBefore: unlinked.length,
        linked,
        stillUnlinked: unlinked.length - linked,
      },
    };

  } else if (intent === "markCompleted") {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "completed" } });

  } else if (intent === "updateStatus") {
    const status = fd.get("status");
    await prisma.booking.update({ where: { id: bookingId }, data: { status } });

  } else if (intent === "sendInvoice") {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, shop: session.shop } });
    if (!booking) return { success: false, error: "Booking not found" };

    // Create draft order if not already created
    let draftId  = booking.draftOrderId;
    let invoiceUrl = booking.draftOrderUrl;

    if (!draftId && booking.depositAmount && booking.totalPrice) {
      const balanceAmount = booking.totalPrice - booking.depositAmount;
      if (balanceAmount > 0) {
        const draft = await createDraftOrder(admin, booking, balanceAmount).catch(() => null);
        if (draft?.id) {
          draftId    = draft.id;
          invoiceUrl = draft.invoiceUrl;
          await prisma.booking.update({
            where: { id: bookingId },
            data: { draftOrderId: draftId, draftOrderUrl: invoiceUrl, balanceStatus: "pending" },
          });
        }
      }
    }

    // Send invoice email via Shopify
    if (draftId) {
      await admin.graphql(`
        mutation draftOrderInvoiceSend($id: ID!) {
          draftOrderInvoiceSend(id: $id) {
            draftOrder { id }
            userErrors { field message }
          }
        }
      `, { variables: { id: draftId } });

      await prisma.booking.update({
        where: { id: bookingId },
        data: { balanceStatus: "invoiced" },
      });
    }
  }

  return { success: true };
};

function fmtDate(str) {
  if (!str) return "—";
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtCurrency(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function nightsLabel(n, type) {
  if (type === "single")   return "1 day";
  if (type === "multiple") return `${n} day${n !== 1 ? "s" : ""}`;
  if (n === 7)             return "1 week";
  if (n === 14)            return "2 weeks";
  if (n === 30)            return "1 month";
  return `${n} night${n !== 1 ? "s" : ""}`;
}

const STATUS_STYLE = {
  pending:   { background: "#fff3cd", color: "#856404" },
  confirmed: { background: "#d4edda", color: "#155724" },
  cancelled: { background: "#f8d7da", color: "#721c24" },
  completed: { background: "#e2e3e5", color: "#383d41" },
};

const TABS = [
  { key: "all",       label: "All" },
  { key: "open",      label: "Open" },
  { key: "complete",  label: "Complete" },
  { key: "cancelled", label: "Cancelled" },
];

const PAGE_SIZE = 10;

function isOpen(status)     { return status === "pending" || status === "confirmed"; }
function isComplete(status) { return status === "completed"; }

export default function BookingPage() {
  const { bookings, shop } = useLoaderData();
  const fetcher = useFetcher();

  const [search,       setSearch]       = useState("");
  const [tab,          setTab]          = useState("all");
  const [futureOnly,   setFutureOnly]   = useState(false);
  const [page,         setPage]         = useState(1);
  const [manageOpen,   setManageOpen]   = useState(null); // bookingId
  const [selected,     setSelected]     = useState(new Set());

  const today = new Date().toISOString().slice(0, 10);

  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch =
      b.guest.toLowerCase().includes(q) ||
      b.apartment.toLowerCase().includes(q) ||
      b.orderId.toLowerCase().includes(q) ||
      b.email.toLowerCase().includes(q);
    const matchTab =
      tab === "all"       ? true :
      tab === "open"      ? isOpen(b.status) :
      tab === "complete"  ? isComplete(b.status) :
      tab === "cancelled" ? b.status === "cancelled" : true;
    const matchFuture = !futureOnly || (b.checkIn && b.checkIn >= today);
    return matchSearch && matchTab && matchFuture;
  });

  const counts = {
    all:       bookings.length,
    open:      bookings.filter((b) => isOpen(b.status)).length,
    complete:  bookings.filter((b) => isComplete(b.status)).length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleStatusUpdate = (bookingId, status) => {
    setManageOpen(null);
    const fd = new FormData();
    fd.append("intent", "updateStatus");
    fd.append("bookingId", bookingId);
    fd.append("status", status);
    fetcher.submit(fd, { method: "POST" });
  };

  const handleMarkCompleted = (bookingId) => {
    const fd = new FormData();
    fd.append("intent", "markCompleted");
    fd.append("bookingId", bookingId);
    fetcher.submit(fd, { method: "POST" });
  };

  const handleBulkAction = (actionType) => {
    if (selected.size === 0) return;
    if (actionType === "delete" && !confirm("Are you sure you want to delete the selected bookings?")) return;
    
    const fd = new FormData();
    fd.append("intent", "bulk");
    fd.append("ids", JSON.stringify(Array.from(selected)));
    fd.append("bulkAction", actionType);
    fetcher.submit(fd, { method: "POST" });
    setSelected(new Set());
  };

  const handleSyncOrders = () => {
    const fd = new FormData();
    fd.append("intent", "syncOrders");
    fetcher.submit(fd, { method: "POST" });
  };

  const syncResult = fetcher.data?.syncResult;

  const handleSendInvoice = (bookingId) => {
    const fd = new FormData();
    fd.append("intent", "sendInvoice");
    fd.append("bookingId", bookingId);
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <s-page heading="Bookings">
      <PlanCard />

      {/* View toggle + New Booking button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        {/* List / Calendar toggle */}
        <div style={{ display: "flex", background: "#f6f6f7", border: "1px solid #e1e3e5", borderRadius: 8, padding: 3, gap: 2 }}>
          <span
            style={{
              padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: "#fff", color: "#202223", border: "1px solid #e1e3e5",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            ☰ List
          </span>
          <a
            href="/app/booking/calendar"
            style={{
              padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500,
              background: "transparent", color: "#6d7175", border: "1px solid transparent",
              display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none",
            }}
          >
            📅 Calendar
          </a>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <a
            href="/api/export/bookings?format=csv"
            download
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 18px", background: "#fff", color: "#202223", border: "1px solid #c9cccf",
              borderRadius: 8, fontSize: 14, fontWeight: 600,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            📊 Export CSV
          </a>
          <a
            href="/api/export/ical/all"
            download
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 18px", background: "#fff", color: "#202223", border: "1px solid #c9cccf",
              borderRadius: 8, fontSize: 14, fontWeight: 600,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            🗓️ Export iCal
          </a>
          <a
            href="/app/booking/new"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 18px", background: "#202223", color: "#fff",
              borderRadius: 8, fontSize: 14, fontWeight: 600,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            + New Booking
          </a>
        </div>
      </div>

      <s-section>
        {/* Sync result banner */}
        {syncResult && (
          <div style={{
            marginBottom: 14, padding: "10px 16px", borderRadius: 8, fontSize: 13,
            background: syncResult.linked > 0 ? "#d4edda" : "#fff3cd",
            color: syncResult.linked > 0 ? "#155724" : "#856404",
            border: `1px solid ${syncResult.linked > 0 ? "#c3e6cb" : "#ffc107"}`,
          }}>
            {syncResult.linked > 0
              ? `✓ Synced ${syncResult.linked} booking${syncResult.linked !== 1 ? "s" : ""} with Shopify orders. ${syncResult.stillUnlinked} booking${syncResult.stillUnlinked !== 1 ? "s" : ""} still unlinked (no matching Shopify order found).`
              : `No new matches found. Shopify returned ${syncResult.shopifyOrders} orders, ${syncResult.unlinkedBefore} bookings have no order yet — customers may not have completed checkout.`
            }
          </div>
        )}

        {/* Top filter bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: 200 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8c9196", display: "flex" }}><Icon source={SearchIcon} /></span>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="#order reference / product name"
              style={{ width: "100%", padding: "9px 12px 9px 32px", border: "1px solid #c9cccf", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {/* Sync Orders button */}
          <button
            onClick={handleSyncOrders}
            disabled={fetcher.state !== "idle"}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px", border: "1px solid #c9cccf", borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "#fff", color: "#202223",
              opacity: fetcher.state !== "idle" ? 0.6 : 1,
            }}
          >
            <Icon source={RefreshIcon} />
            {fetcher.state !== "idle" ? "Syncing…" : "Sync Orders"}
          </button>

          {/* Future Bookings toggle */}
          <button
            onClick={() => { setFutureOnly((v) => !v); setPage(1); }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px", border: "1px solid #c9cccf", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: futureOnly ? "#f1f2f3" : "#fff",
              color: futureOnly ? "#202223" : "#6d7175",
            }}
          >
            <Icon source={CalendarIcon} />
            Future Bookings
          </button>

          {/* All Time label */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 16px", border: "1px solid #c9cccf", borderRadius: 8,
            fontSize: 13, color: "#6d7175", background: "#fff",
          }}>
            <Icon source={CalendarIcon} />
            All Time
          </div>
        </div>

        {/* Tabs + count */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #e1e3e5", marginBottom: 16 }}>
          <div style={{ display: "flex" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1); }}
                style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                  color: tab === t.key ? "#202223" : "#6d7175",
                  background: "none", border: "none",
                  borderBottom: tab === t.key ? "2px solid #202223" : "2px solid transparent",
                  marginBottom: -2, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13, color: "#6d7175", paddingBottom: 8 }}>
            {filtered.length} booking{filtered.length !== 1 ? "s" : ""} — {new Set(filtered.map((b) => b.apartment)).size} product{new Set(filtered.map((b) => b.apartment)).size !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Bulk Actions Bar */}
        {selected.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#f4f6f8", border: "1px solid #c9cccf", borderRadius: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#202223" }}>{selected.size} selected</span>
            <button
              onClick={() => handleBulkAction("confirmed")}
              style={{ padding: "5px 12px", fontSize: 13, fontWeight: 500, borderRadius: 4, border: "1px solid #c9cccf", background: "#fff", cursor: "pointer" }}
            >
              Confirm
            </button>
            <button
              onClick={() => handleBulkAction("cancelled")}
              style={{ padding: "5px 12px", fontSize: 13, fontWeight: 500, borderRadius: 4, border: "1px solid #c9cccf", background: "#fff", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => handleBulkAction("delete")}
              style={{ padding: "5px 12px", fontSize: 13, fontWeight: 500, borderRadius: 4, border: "1px solid #c9cccf", background: "#fff", color: "#d82c0d", cursor: "pointer", marginLeft: "auto" }}
            >
              Delete
            </button>
          </div>
        )}

        {/* Card list */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ border: "1px solid #e1e3e5", borderRadius: 10, overflow: "hidden", background: "#fff", minWidth: 700 }}>
          {/* Header row with Select All */}
          {paged.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", borderBottom: "1px solid #e1e3e5", background: "#fafbfc" }}>
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={(e) => {
                  if (e.target.checked) setSelected(new Set(filtered.map(b => b.id)));
                  else setSelected(new Set());
                }}
                style={{ cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#6d7175" }}>Select All (in current view)</span>
            </div>
          )}

          {paged.length === 0 ? (
            <div style={{ padding: "56px 24px", textAlign: "center", fontSize: 14, color: "#6d7175" }}>
              {bookings.length === 0 ? "No bookings yet." : "No bookings match your filters."}
            </div>
          ) : (
            paged.map((b, i) => {
              const isLast   = i === paged.length - 1;
              const isManage = manageOpen === b.id;
              const orderAdminUrl = b.shopifyOrderId
                ? `https://${shop}/admin/orders/${b.shopifyOrderId}`
                : null;
              const dateLabel = b.checkOut && b.checkOut !== b.checkIn
                ? `${b.checkInFmt} to ${b.checkOutFmt}`
                : b.checkInFmt;

              return (
                <div
                  key={b.id}
                  style={{ borderBottom: isLast ? "none" : "1px solid #e1e3e5", padding: "18px 20px", background: selected.has(b.id) ? "#f4f6f8" : "#fff" }}
                >
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", alignSelf: "center", paddingRight: 4 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(b.id)}
                        onChange={() => setSelected((prev) => {
                          const next = new Set(prev);
                          next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                          return next;
                        })}
                        style={{ cursor: "pointer" }}
                      />
                    </div>
                    {/* Thumbnail */}
                    <div style={{ width: 56, height: 56, borderRadius: 8, background: "#f1f2f3", border: "1px solid #e1e3e5", flexShrink: 0 }} />

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "#202223", fontWeight: 500, marginBottom: 3 }}>
                        {b.orderId} &bull; {b.apartment} &bull; {nightsLabel(b.nights, b.bookingType)} &bull;{" "}
                        <span style={{ textTransform: "capitalize" }}>{b.bookingType}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#202223", marginBottom: 2 }}>
                        {b.guest}
                      </div>
                      {b.email && (
                        <div style={{ fontSize: 13, color: "#6d7175" }}>{b.email}</div>
                      )}
                    </div>

                    {/* Actions + dates */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {/* View Order */}
                        <button
                          title={orderAdminUrl ? "View Order in Shopify" : "No order placed yet"}
                          disabled={!orderAdminUrl}
                          onClick={() => orderAdminUrl && window.open(orderAdminUrl, "_blank")}
                          style={{
                            padding: "7px 14px", border: "1px solid #c9cccf", borderRadius: 6,
                            fontSize: 13, fontWeight: 500, cursor: orderAdminUrl ? "pointer" : "not-allowed",
                            background: "#fff", color: orderAdminUrl ? "#202223" : "#c9cccf",
                          }}
                        >
                          View Order
                        </button>

                        {/* Manage dropdown */}
                        <div style={{ position: "relative" }}>
                          <button
                            onClick={() => setManageOpen(isManage ? null : b.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "7px 14px", border: "1px solid #c9cccf", borderRadius: 6,
                              fontSize: 13, fontWeight: 500, background: "#fff", cursor: "pointer", color: "#202223",
                            }}
                          >
                            Manage
                            <Icon source={ChevronDownIcon} />
                          </button>
                          {isManage && (
                            <div style={{
                              position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20,
                              background: "#fff", border: "1px solid #e1e3e5", borderRadius: 8,
                              boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 160, overflow: "hidden",
                            }}>
                              {[
                                { key: "pending",   label: "Mark as Pending" },
                                { key: "confirmed", label: "Mark as Confirmed" },
                                { key: "completed", label: "Mark as Completed" },
                                { key: "cancelled", label: "Mark as Cancelled" },
                              ].map((opt) => (
                                <button
                                  key={opt.key}
                                  onClick={() => handleStatusUpdate(b.id, opt.key)}
                                  style={{
                                    display: "block", width: "100%", textAlign: "left",
                                    padding: "10px 14px", fontSize: 13, border: "none",
                                    background: b.status === opt.key ? "#f6f6f7" : "#fff",
                                    fontWeight: b.status === opt.key ? 600 : 400,
                                    cursor: "pointer", color: "#202223",
                                  }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Send Balance Invoice */}
                        {b.balanceDue && b.balanceStatus !== "paid" && (
                          b.balanceStatus === "invoiced" ? (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "7px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                              background: "#d4edda", color: "#155724", border: "1px solid #c3e6cb",
                            }}>
                              <Icon source={EmailIcon} /> Invoice Sent
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSendInvoice(b.id)}
                              style={{
                                padding: "7px 14px", borderRadius: 6,
                                border: "1px solid #c9cccf", fontSize: 13, fontWeight: 600,
                                background: "#fff", color: "#202223", cursor: "pointer",
                              }}
                            >
                              Send Invoice
                            </button>
                          )
                        )}

                        {/* Mark as Completed */}
                        {b.status !== "completed" && (
                          <button
                            onClick={() => handleMarkCompleted(b.id)}
                            style={{
                              padding: "7px 14px", borderRadius: 6, border: "none",
                              fontSize: 13, fontWeight: 600, background: "#202223",
                              color: "#fff", cursor: "pointer",
                            }}
                          >
                            Mark as Completed
                          </button>
                        )}
                        {b.status === "completed" && (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "7px 14px", borderRadius: 6,
                            fontSize: 13, fontWeight: 600,
                            background: "#e2e3e5", color: "#383d41",
                          }}>
                            <Icon source={CheckSmallIcon} /> Completed
                          </span>
                        )}
                      </div>

                      {/* Dates + meta */}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#202223", marginBottom: 4 }}>
                          {dateLabel}
                        </div>
                        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", fontSize: 13, color: "#6d7175" }}>
                          <span>Quantity : {b.quantity}</span>
                          <span style={{
                            padding: "1px 9px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                            ...(STATUS_STYLE[b.status] || STATUS_STYLE.pending),
                          }}>
                            {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#202223", marginTop: 4 }}>
                          {b.total}
                        </div>
                        {b.depositAmount && (
                          <div style={{ fontSize: 12, color: "#6d7175", marginTop: 2 }}>
                            Deposit paid: {b.depositAmount}
                            {b.balanceDue && (
                              <span style={{
                                marginLeft: 8, fontWeight: 600,
                                color: b.balanceStatus === "invoiced" ? "#155724" : "#856404",
                              }}>
                                · Balance due: {b.balanceDue}
                                {b.balanceStatus === "invoiced" && " (invoiced)"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 16 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #c9cccf", background: "#fff", cursor: safePage === 1 ? "not-allowed" : "pointer", color: safePage === 1 ? "#c9cccf" : "#202223", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Icon source={ChevronLeftIcon} />
            </button>
            <span style={{ fontSize: 13, color: "#6d7175" }}>{safePage} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #c9cccf", background: "#fff", cursor: safePage === totalPages ? "not-allowed" : "pointer", color: safePage === totalPages ? "#c9cccf" : "#202223", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Icon source={ChevronRightIcon} />
            </button>
          </div>
        )}
      </s-section>
    </s-page>
  );
}
