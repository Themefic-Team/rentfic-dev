import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendNotification } from "../email.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);

  const booking = await prisma.booking.findFirst({
    where: { id: params.id, shop: session.shop },
  });

  if (!booking) throw new Response("Not found", { status: 404 });

  const numericOrderId = booking.orderId
    ? booking.orderId.replace(/\D/g, "")
    : null;

  return {
    booking: {
      id:            booking.id,
      guest:         booking.customerName  || "—",
      email:         booking.customerEmail || null,
      apartment:     booking.productTitle  || "—",
      checkIn:       booking.startDate,
      checkOut:      booking.endDate,
      checkInFmt:    fmtDate(booking.startDate),
      checkOutFmt:   fmtDate(booking.endDate),
      nights:        booking.nights ?? 1,
      total:         booking.totalPrice != null ? fmtCurrency(booking.totalPrice) : "—",
      depositAmount: booking.depositAmount != null ? fmtCurrency(booking.depositAmount) : null,
      balanceDue:    (booking.totalPrice != null && booking.depositAmount != null)
                       ? fmtCurrency(booking.totalPrice - booking.depositAmount)
                       : null,
      status:        booking.status,
      orderId:       booking.orderNumber ? `#${booking.orderNumber}` : null,
      shopifyOrderId: numericOrderId,
      quantity:      booking.lineItemProperties?.quantity ?? 1,
      bookingType:   booking.lineItemProperties?.bookingType ?? "range",
      guests:        booking.lineItemProperties?.guests ?? {},
      dates:         booking.lineItemProperties?.dates ?? null,
      createdAt:     booking.createdAt,
      notes:         booking.notes ?? "",
    },
    shop: session.shop,
  };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const fd     = await request.formData();
  const intent = fd.get("intent");

  // ── Edit booking details ───────────────────────────────────────────────────
  if (intent === "edit") {
    const startDate = fd.get("startDate") || undefined;
    const endDate   = fd.get("endDate")   || undefined;
    const nights =
      startDate && endDate
        ? Math.round((new Date(endDate) - new Date(startDate)) / 86_400_000)
        : undefined;

    await prisma.booking.update({
      where: { id: params.id, shop: session.shop },
      data: {
        customerName:  fd.get("customerName")  || undefined,
        customerEmail: fd.get("customerEmail") || undefined,
        startDate,
        endDate,
        nights:        nights ?? undefined,
        notes:         fd.get("notes") ?? undefined,
      },
    });

    return { success: true, edited: true };
  }

  // ── Change status ──────────────────────────────────────────────────────────
  const newStatus = fd.get("status");

  // Fetch the booking BEFORE updating so we can check the previous status
  const booking = await prisma.booking.findFirst({
    where: { id: params.id, shop: session.shop },
  });

  if (!booking) return { success: false, error: "Booking not found" };

  // Update status in DB
  await prisma.booking.update({
    where: { id: params.id, shop: session.shop },
    data:  { status: newStatus },
  });

  // ── Fire cancellation emails when status changes TO "cancelled" ──────────
  if (newStatus === "cancelled" && booking.status !== "cancelled") {
    const [firstName, ...rest] = (booking.customerName || "").split(" ");
    const vars = {
      "date":               booking.startDate,
      "start":              booking.startDate,
      "end":                booking.endDate ?? booking.startDate,
      "product.name":       booking.productTitle  ?? "",
      "order.name":         booking.orderNumber ? `#${booking.orderNumber}` : "",
      "customer.firstName": firstName || "",
      "customer.lastName":  rest.join(" ") || "",
    };

    // 1. Guest cancellation email
    if (booking.customerEmail) {
      await sendNotification(
        session.shop,
        "bookingCancelled",
        vars,
        { to: booking.customerEmail }
      ).catch((e) => console.error("[Rentfic] Guest cancel email failed:", e));
    }

    // 2. Shop-owner cancellation alert
    const shopRecord = await prisma.shop.findUnique({
      where:  { shop: session.shop },
      select: { email: true },
    });
    if (shopRecord?.email) {
      await sendNotification(
        session.shop,
        "ownerBookingCancelled",
        vars,
        { to: shopRecord.email }
      ).catch((e) => console.error("[Rentfic] Owner cancel email failed:", e));
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

const STATUS_STYLE = {
  pending:   { background: "#fff3cd", color: "#856404" },
  confirmed: { background: "#d4edda", color: "#155724" },
  cancelled: { background: "#f8d7da", color: "#721c24" },
  completed: { background: "#e2e3e5", color: "#383d41" },
};

const STATUS_OPTIONS = ["pending", "confirmed", "completed", "cancelled"];

export default function BookingDetail() {
  const { booking, shop } = useLoaderData();
  const navigate  = useNavigate();
  const fetcher   = useFetcher();

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [editing,    setEditing]    = useState(false);
  const [guestName,  setGuestName]  = useState(booking.guest === "—" ? "" : booking.guest);
  const [guestEmail, setGuestEmail] = useState(booking.email ?? "");
  const [checkIn,    setCheckIn]    = useState(booking.checkIn  ?? "");
  const [checkOut,   setCheckOut]   = useState(booking.checkOut ?? "");
  const [notes,      setNotes]      = useState(booking.notes    ?? "");

  // Auto-calculate nights whenever dates change
  const calcNights =
    checkIn && checkOut
      ? Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 86_400_000))
      : booking.nights;

  const isSaving = fetcher.state !== "idle";

  const orderAdminUrl = booking.shopifyOrderId
    ? `https://${shop}/admin/orders/${booking.shopifyOrderId}`
    : null;

  const handleStatus = (status) => {
    const fd = new FormData();
    fd.append("status", status);
    fetcher.submit(fd, { method: "POST" });
  };

  const handleEdit = () => {
    const fd = new FormData();
    fd.append("intent",        "edit");
    fd.append("customerName",  guestName);
    fd.append("customerEmail", guestEmail);
    fd.append("startDate",     checkIn);
    fd.append("endDate",       checkOut);
    fd.append("notes",         notes);
    fetcher.submit(fd, { method: "POST" });
    setEditing(false);
  };

  const cancelEdit = () => {
    setGuestName(booking.guest === "—" ? "" : booking.guest);
    setGuestEmail(booking.email ?? "");
    setCheckIn(booking.checkIn  ?? "");
    setCheckOut(booking.checkOut ?? "");
    setNotes(booking.notes ?? "");
    setEditing(false);
  };

  return (
    <s-page heading="Booking Details">
      {/* Back link */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => navigate("/app/booking")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#005bd3", padding: 0, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back to Bookings
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

        {/* Left — main info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Booking info card */}
          <div style={card}>
            <div style={{ ...cardHeading, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Booking Information</span>
              {!editing && (
                <button onClick={() => setEditing(true)} style={editBtn}>
                  ✏️ Edit
                </button>
              )}
            </div>

            <Row label="Booking ID"   value={<code style={{ fontSize: 13, background: "#f6f6f7", padding: "2px 6px", borderRadius: 4 }}>{booking.id}</code>} />
            <Row label="Apartment"    value={booking.apartment} />
            <Row label="Booking Type" value={<span style={{ textTransform: "capitalize" }}>{booking.bookingType}</span>} />
            <Row label="Status"       value={
              <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600, ...(STATUS_STYLE[booking.status] || STATUS_STYLE.pending) }}>
                {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
              </span>
            } />
            {booking.orderId && (
              <Row label="Order" value={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{booking.orderId}</span>
                  {orderAdminUrl && (
                    <button
                      onClick={() => window.open(orderAdminUrl, "_blank")}
                      style={{ fontSize: 12, color: "#005bd3", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    >
                      View in Shopify →
                    </button>
                  )}
                </span>
              } />
            )}
            <Row label="Created" value={new Date(booking.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
          </div>

          {/* Dates card */}
          <div style={card}>
            <div style={cardHeading}>Dates</div>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
                <label style={labelStyle}>
                  Check-in
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Check-out
                  <input
                    type="date"
                    value={checkOut}
                    min={checkIn || undefined}
                    onChange={(e) => setCheckOut(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <div style={{ fontSize: 13, color: "#6d7175" }}>
                  Nights: <strong style={{ color: "#202223" }}>{calcNights}</strong>
                </div>
              </div>
            ) : (
              <>
                <Row label="Check-in"  value={booking.checkInFmt} />
                <Row label="Check-out" value={booking.checkOutFmt} />
                <Row label="Nights"    value={booking.nights} />
                {booking.dates && (
                  <Row label="Selected dates" value={
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {booking.dates.map((d) => (
                        <span key={d} style={{ fontSize: 12, background: "#f1f2f3", padding: "2px 8px", borderRadius: 6 }}>{d}</span>
                      ))}
                    </div>
                  } />
                )}
              </>
            )}
          </div>

          {/* Guest card */}
          <div style={card}>
            <div style={cardHeading}>Guest</div>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
                <label style={labelStyle}>
                  Guest Name
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Full name"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Guest Email
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="email@example.com"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Internal Notes
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any internal notes about this booking…"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                </label>
                {/* Save / Cancel buttons */}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={handleEdit}
                    disabled={isSaving}
                    style={{
                      flex: 1, padding: "9px 0", background: "#008060", color: "#fff",
                      border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600,
                      cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.7 : 1,
                    }}
                  >
                    {isSaving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isSaving}
                    style={{
                      flex: 1, padding: "9px 0", background: "#fff", color: "#202223",
                      border: "1px solid #c9cccf", borderRadius: 7, fontSize: 13, fontWeight: 600,
                      cursor: isSaving ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Row label="Name"  value={booking.guest} />
                {booking.email && <Row label="Email" value={<a href={`mailto:${booking.email}`} style={{ color: "#005bd3" }}>{booking.email}</a>} />}
                {booking.guests?.adults   != null && <Row label="Adults"   value={booking.guests.adults} />}
                {booking.guests?.children != null && <Row label="Children" value={booking.guests.children} />}
                {booking.guests?.infants  != null && <Row label="Infants"  value={booking.guests.infants} />}
                <Row label="Units / Quantity" value={booking.quantity} />
                {booking.notes && (
                  <Row label="Notes" value={<span style={{ color: "#6d7175", fontStyle: "italic" }}>{booking.notes}</span>} />
                )}
              </>
            )}
          </div>

        </div>

        {/* Right — summary + actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Payment summary */}
          <div style={card}>
            <div style={cardHeading}>Payment Summary</div>
            <Row label="Total Price" value={<strong>{booking.total}</strong>} />
            {booking.depositAmount && (
              <>
                <Row label="Deposit Paid" value={<span style={{ color: "#155724", fontWeight: 600 }}>{booking.depositAmount}</span>} />
                <Row label="Balance Due"  value={<span style={{ color: "#856404", fontWeight: 600 }}>{booking.balanceDue}</span>} />
              </>
            )}
          </div>

          {/* Status management */}
          <div style={card}>
            <div style={cardHeading}>Manage Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatus(s)}
                  disabled={booking.status === s}
                  style={{
                    padding: "9px 14px", borderRadius: 7, border: "1px solid",
                    fontSize: 13, fontWeight: 600, cursor: booking.status === s ? "default" : "pointer",
                    textAlign: "left",
                    ...(booking.status === s
                      ? { ...(STATUS_STYLE[s] || {}), borderColor: "transparent", opacity: 0.8 }
                      : { background: "#fff", borderColor: "#c9cccf", color: "#202223" }),
                  }}
                >
                  {booking.status === s ? "✓ " : ""}{s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* View in Shopify */}
          {orderAdminUrl && (
            <button
              onClick={() => window.open(orderAdminUrl, "_blank")}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 7,
                border: "1px solid #c9cccf", background: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#202223",
              }}
            >
              View Order in Shopify →
            </button>
          )}
        </div>
      </div>
    </s-page>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f2f3" }}>
      <span style={{ fontSize: 13, color: "#6d7175", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#202223", textAlign: "right" }}>{value}</span>
    </div>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #e1e3e5",
  borderRadius: 10,
  padding: "16px 20px",
};

const cardHeading = {
  fontSize: 14,
  fontWeight: 700,
  color: "#202223",
  marginBottom: 4,
  paddingBottom: 10,
  borderBottom: "1px solid #e1e3e5",
};

const editBtn = {
  fontSize: 12,
  fontWeight: 600,
  color: "#005bd3",
  background: "none",
  border: "1px solid #005bd3",
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  fontWeight: 600,
  color: "#202223",
};

const inputStyle = {
  padding: "7px 10px",
  border: "1px solid #c9cccf",
  borderRadius: 6,
  fontSize: 13,
  color: "#202223",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};
