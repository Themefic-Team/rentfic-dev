import { useState } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendNotification } from "../email.server";
import { Icon } from "@shopify/polaris";
import { EmailIcon, CheckSmallIcon, ChevronLeftIcon, EditIcon, DeleteIcon, SaveIcon, ExternalSmallIcon } from "@shopify/polaris-icons";

export const loader = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);

  const booking = await prisma.booking.findFirst({
    where: { id: params.id, shop: session.shop },
  });

  if (!booking) throw new Response("Not found", { status: 404 });

  // Fetch apartment details for additional context
  const apartment = await prisma.apartment.findFirst({
    where: { id: booking.apartmentId, shop: session.shop },
    select: { name: true, pricePerNight: true, settings: true },
  });

  const numericOrderId = booking.orderId
    ? booking.orderId.replace(/\D/g, "")
    : null;

  const balanceNum = (booking.totalPrice != null && booking.depositAmount != null)
    ? booking.totalPrice - booking.depositAmount
    : null;

  return {
    booking: {
      id:            booking.id,
      guest:         booking.customerName  || "—",
      email:         booking.customerEmail || null,
      apartment:     booking.productTitle  || "—",
      apartmentId:   booking.apartmentId,
      checkIn:       booking.startDate,
      checkOut:      booking.endDate,
      checkInFmt:    fmtDate(booking.startDate),
      checkOutFmt:   fmtDate(booking.endDate),
      nights:        booking.nights ?? 1,
      total:         booking.totalPrice != null ? fmtCurrency(booking.totalPrice) : "—",
      totalRaw:      booking.totalPrice,
      depositAmount: booking.depositAmount != null ? fmtCurrency(booking.depositAmount) : null,
      depositRaw:    booking.depositAmount,
      balanceDue:    balanceNum != null && balanceNum > 0 ? fmtCurrency(balanceNum) : null,
      balanceRaw:    balanceNum,
      balanceStatus: booking.balanceStatus || null,
      draftOrderId:  booking.draftOrderId || null,
      draftOrderUrl: booking.draftOrderUrl || null,
      status:        booking.status,
      orderId:       booking.orderNumber ? `#${booking.orderNumber}` : null,
      orderNumber:   booking.orderNumber,
      shopifyOrderId: numericOrderId,
      quantity:      booking.lineItemProperties?.quantity ?? 1,
      bookingType:   booking.lineItemProperties?.bookingType ?? "range",
      guests:        booking.lineItemProperties?.guests ?? {},
      dates:         booking.lineItemProperties?.dates ?? null,
      createdAt:     booking.createdAt,
      notes:         booking.notes ?? "",
      pricePerNight: apartment?.pricePerNight ?? null,
    },
    shop: session.shop,
  };
};

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

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const fd     = await request.formData();
  const intent = fd.get("intent");

  // ── Delete booking ────────────────────────────────────────────────────────
  if (intent === "delete") {
    await prisma.booking.delete({
      where: { id: params.id },
    });
    return { success: true, deleted: true };
  }

  // ── Edit booking details ───────────────────────────────────────────────────
  if (intent === "edit") {
    const startDate = fd.get("startDate") || undefined;
    const endDate   = fd.get("endDate")   || undefined;
    const nights =
      startDate && endDate
        ? Math.round((new Date(endDate) - new Date(startDate)) / 86_400_000)
        : undefined;

    const totalPrice = fd.get("totalPrice");
    const depositAmount = fd.get("depositAmount");

    await prisma.booking.update({
      where: { id: params.id, shop: session.shop },
      data: {
        customerName:  fd.get("customerName")  || undefined,
        customerEmail: fd.get("customerEmail") || undefined,
        startDate,
        endDate,
        nights:        nights ?? undefined,
        notes:         fd.get("notes") ?? undefined,
        totalPrice:    totalPrice ? parseFloat(totalPrice) : undefined,
        depositAmount: depositAmount ? parseFloat(depositAmount) : undefined,
      },
    });

    return { success: true, edited: true };
  }

  // ── Send balance invoice ──────────────────────────────────────────────────
  if (intent === "sendInvoice") {
    const booking = await prisma.booking.findFirst({ where: { id: params.id, shop: session.shop } });
    if (!booking) return { success: false, error: "Booking not found" };

    let draftId    = booking.draftOrderId;
    let invoiceUrl = booking.draftOrderUrl;

    if (!draftId && booking.depositAmount && booking.totalPrice) {
      const balanceAmount = booking.totalPrice - booking.depositAmount;
      if (balanceAmount > 0) {
        const draft = await createDraftOrder(admin, booking, balanceAmount).catch(() => null);
        if (draft?.id) {
          draftId    = draft.id;
          invoiceUrl = draft.invoiceUrl;
          await prisma.booking.update({
            where: { id: params.id },
            data: { draftOrderId: draftId, draftOrderUrl: invoiceUrl, balanceStatus: "pending" },
          });
        }
      }
    }

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
        where: { id: params.id },
        data: { balanceStatus: "invoiced" },
      });
    }

    return { success: true, invoiceSent: true };
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

function relativeDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

const STATUS_STYLE = {
  pending:   { background: "#fff3cd", color: "#856404", border: "1px solid #ffc107" },
  confirmed: { background: "#d4edda", color: "#155724", border: "1px solid #c3e6cb" },
  cancelled: { background: "#f8d7da", color: "#721c24", border: "1px solid #f5c6cb" },
  completed: { background: "#e2e3e5", color: "#383d41", border: "1px solid #d6d8db" },
};

const STATUS_OPTIONS = ["pending", "confirmed", "completed", "cancelled"];

const BALANCE_STATUS_STYLE = {
  pending:  { background: "#fff3cd", color: "#856404" },
  invoiced: { background: "#cce5ff", color: "#004085" },
  paid:     { background: "#d4edda", color: "#155724" },
};

export default function BookingDetail() {
  const { booking, shop } = useLoaderData();
  const navigate  = useNavigate();
  const fetcher   = useFetcher();

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [editing,       setEditing]       = useState(false);
  const [guestName,     setGuestName]     = useState(booking.guest === "—" ? "" : booking.guest);
  const [guestEmail,    setGuestEmail]    = useState(booking.email ?? "");
  const [checkIn,       setCheckIn]       = useState(booking.checkIn  ?? "");
  const [checkOut,      setCheckOut]      = useState(booking.checkOut ?? "");
  const [notes,         setNotes]         = useState(booking.notes    ?? "");
  const [totalPrice,    setTotalPrice]    = useState(booking.totalRaw?.toString() ?? "");
  const [depositAmount, setDepositAmount] = useState(booking.depositRaw?.toString() ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Auto-calculate nights whenever dates change
  const calcNights =
    checkIn && checkOut
      ? Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 86_400_000))
      : booking.nights;

  const isSaving = fetcher.state !== "idle";

  // Handle delete redirect
  if (fetcher.data?.deleted) {
    navigate("/app/booking");
  }

  const orderAdminUrl = booking.shopifyOrderId
    ? `https://${shop}/admin/orders/${booking.shopifyOrderId}`
    : null;

  const handleStatus = (status) => {
    if (status === "cancelled" && !confirm("Are you sure you want to cancel this booking? This will send cancellation emails to the guest and shop owner.")) {
      return;
    }
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
    if (totalPrice)    fd.append("totalPrice",    totalPrice);
    if (depositAmount) fd.append("depositAmount", depositAmount);
    fetcher.submit(fd, { method: "POST" });
    setEditing(false);
  };

  const cancelEdit = () => {
    setGuestName(booking.guest === "—" ? "" : booking.guest);
    setGuestEmail(booking.email ?? "");
    setCheckIn(booking.checkIn  ?? "");
    setCheckOut(booking.checkOut ?? "");
    setNotes(booking.notes ?? "");
    setTotalPrice(booking.totalRaw?.toString() ?? "");
    setDepositAmount(booking.depositRaw?.toString() ?? "");
    setEditing(false);
  };

  const handleDelete = () => {
    const fd = new FormData();
    fd.append("intent", "delete");
    fetcher.submit(fd, { method: "POST" });
    setShowDeleteConfirm(false);
  };

  const handleSendInvoice = () => {
    const fd = new FormData();
    fd.append("intent", "sendInvoice");
    fetcher.submit(fd, { method: "POST" });
  };

  const checkInRelative  = relativeDate(booking.checkIn);
  const checkOutRelative = relativeDate(booking.checkOut);

  return (
    <s-page heading="Booking Details">
      {/* ── Header Bar ────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 20, flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate("/app/booking")}
            style={backBtnStyle}
          >
            <Icon source={ChevronLeftIcon} /> Back
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#202223" }}>
                {booking.orderId || `Booking …${booking.id.slice(-6)}`}
              </span>
              <span style={{
                padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700,
                ...(STATUS_STYLE[booking.status] || STATUS_STYLE.pending),
              }}>
                {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#6d7175", marginTop: 2 }}>
              {booking.apartment} · {booking.nights} night{booking.nights !== 1 ? "s" : ""} · {booking.total}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!editing && (
            <button onClick={() => setEditing(true)} style={actionBtnStyle}>
              <Icon source={EditIcon} /> Edit
            </button>
          )}
          {orderAdminUrl && (
            <button
              onClick={() => window.open(orderAdminUrl, "_blank")}
              style={actionBtnStyle}
            >
              View Shopify Order <Icon source={ExternalSmallIcon} />
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{ ...actionBtnStyle, color: "#d82c0d", borderColor: "#d82c0d" }}
          >
            <Icon source={DeleteIcon} tone="critical" /> Delete
          </button>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: "28px 32px",
            maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#202223", marginBottom: 8 }}>
              Delete Booking
            </div>
            <div style={{ fontSize: 14, color: "#6d7175", marginBottom: 20, lineHeight: 1.5 }}>
              Are you sure you want to permanently delete this booking
              <strong> {booking.orderId || `…${booking.id.slice(-6)}`}</strong>?
              This action cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{ ...actionBtnStyle, padding: "9px 20px" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isSaving}
                style={{
                  padding: "9px 20px", borderRadius: 7, border: "none",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: "#d82c0d", color: "#fff",
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? "Deleting…" : "Delete Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success banners ──────────────────────────────────────────────── */}
      {fetcher.data?.edited && (
        <div style={bannerSuccess}>✓ Booking updated successfully.</div>
      )}
      {fetcher.data?.invoiceSent && (
        <div style={bannerSuccess}>✓ Balance invoice sent to guest.</div>
      )}

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, alignItems: "start" }}>

        {/* ──────── Left Column ──────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Booking Information Card ── */}
          <div style={card}>
            <div style={cardHeading}>Booking Information</div>
            <Row label="Booking ID" value={
              <code style={{ fontSize: 12, background: "#f6f6f7", padding: "3px 8px", borderRadius: 4, fontFamily: "monospace" }}>
                {booking.id}
              </code>
            } />
            <Row label="Apartment" value={
              <span style={{ fontWeight: 600 }}>{booking.apartment}</span>
            } />
            <Row label="Booking Type" value={
              <span style={{
                padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: "#f1f2f3", color: "#202223", textTransform: "capitalize",
              }}>
                {booking.bookingType}
              </span>
            } />
            {booking.orderId && (
              <Row label="Shopify Order" value={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{booking.orderId}</span>
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
            <Row label="Created" value={
              new Date(booking.createdAt).toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
              })
            } />
          </div>

          {/* ── Dates & Stay Card ── */}
          <div style={card}>
            <div style={cardHeading}>Dates & Stay</div>
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
                <Row label="Check-in" value={
                  <span>
                    {booking.checkInFmt}
                    {checkInRelative && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: "#6d7175", fontStyle: "italic" }}>
                        ({checkInRelative})
                      </span>
                    )}
                  </span>
                } />
                <Row label="Check-out" value={
                  <span>
                    {booking.checkOutFmt}
                    {checkOutRelative && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: "#6d7175", fontStyle: "italic" }}>
                        ({checkOutRelative})
                      </span>
                    )}
                  </span>
                } />
                <Row label="Nights" value={
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{booking.nights}</span>
                } />
                {booking.pricePerNight != null && (
                  <Row label="Rate / Night" value={fmtCurrency(booking.pricePerNight)} />
                )}
                {booking.dates && (
                  <Row label="Selected Dates" value={
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

          {/* ── Guest Information Card ── */}
          <div style={card}>
            <div style={cardHeading}>Guest Information</div>
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
              </div>
            ) : (
              <>
                <Row label="Name" value={
                  <span style={{ fontWeight: 600 }}>{booking.guest}</span>
                } />
                {booking.email && (
                  <Row label="Email" value={
                    <a href={`mailto:${booking.email}`} style={{ color: "#005bd3", textDecoration: "none" }}>
                      {booking.email}
                    </a>
                  } />
                )}
                {booking.guests?.adults   != null && <Row label="Adults"   value={booking.guests.adults} />}
                {booking.guests?.children != null && <Row label="Children" value={booking.guests.children} />}
                {booking.guests?.infants  != null && <Row label="Infants"  value={booking.guests.infants} />}
                <Row label="Units / Quantity" value={booking.quantity} />
              </>
            )}
          </div>

          {/* ── Notes Card ── */}
          <div style={card}>
            <div style={cardHeading}>Internal Notes</div>
            {editing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any internal notes about this booking…"
                rows={4}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", marginTop: 8 }}
              />
            ) : (
              <div style={{ fontSize: 13, color: booking.notes ? "#202223" : "#8c9196", padding: "10px 0", fontStyle: booking.notes ? "normal" : "italic", lineHeight: 1.6 }}>
                {booking.notes || "No notes added."}
              </div>
            )}
          </div>

          {/* ── Edit Save / Cancel Bar ── */}
          {editing && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleEdit}
                disabled={isSaving}
                style={{
                  flex: 1, padding: "11px 0", background: "#008060", color: "#fff",
                  border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  cursor: isSaving ? "not-allowed" : "pointer", opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? "Saving…" : <><Icon source={SaveIcon} /> Save Changes</>}
              </button>
              <button
                onClick={cancelEdit}
                disabled={isSaving}
                style={{
                  flex: 1, padding: "11px 0", background: "#fff", color: "#202223",
                  border: "1px solid #c9cccf", borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: isSaving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ──────── Right Column ──────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Payment Summary Card ── */}
          <div style={card}>
            <div style={cardHeading}>Payment Summary</div>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
                <label style={labelStyle}>
                  Total Price ($)
                  <input
                    type="number"
                    step="0.01"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Deposit Amount ($)
                  <input
                    type="number"
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    style={inputStyle}
                  />
                </label>
              </div>
            ) : (
              <>
                <Row label="Total Price" value={
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#202223" }}>{booking.total}</span>
                } />
                {booking.depositAmount && (
                  <>
                    <Row label="Deposit Paid" value={
                      <span style={{ color: "#155724", fontWeight: 600 }}>{booking.depositAmount}</span>
                    } />
                    {booking.balanceDue && (
                      <Row label="Balance Due" value={
                        <span style={{ color: "#856404", fontWeight: 600 }}>{booking.balanceDue}</span>
                      } />
                    )}
                    {booking.balanceStatus && (
                      <Row label="Balance Status" value={
                        <span style={{
                          padding: "2px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                          ...(BALANCE_STATUS_STYLE[booking.balanceStatus] || {}),
                        }}>
                          {booking.balanceStatus.charAt(0).toUpperCase() + booking.balanceStatus.slice(1)}
                        </span>
                      } />
                    )}
                  </>
                )}

                {/* Invoice Actions */}
                {booking.balanceDue && booking.balanceStatus !== "paid" && (
                  <div style={{ borderTop: "1px solid #f1f2f3", paddingTop: 12, marginTop: 4 }}>
                    {booking.balanceStatus === "invoiced" ? (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                        background: "#d4edda", color: "#155724",
                      }}>
                        <Icon source={EmailIcon} /> Invoice Sent
                      </div>
                    ) : (
                      <button
                        onClick={handleSendInvoice}
                        disabled={isSaving}
                        style={{
                          width: "100%", padding: "9px 14px", borderRadius: 7,
                          border: "1px solid #c9cccf", fontSize: 13, fontWeight: 600,
                          background: "#fff", color: "#202223", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          opacity: isSaving ? 0.7 : 1,
                        }}
                      >
                        <Icon source={EmailIcon} />
                        {isSaving ? "Sending…" : "Send Balance Invoice"}
                      </button>
                    )}
                    {booking.draftOrderUrl && (
                      <button
                        onClick={() => window.open(booking.draftOrderUrl, "_blank")}
                        style={{
                          width: "100%", marginTop: 8, padding: "8px 14px", borderRadius: 7,
                          border: "1px solid #c9cccf", fontSize: 12, fontWeight: 500,
                          background: "#fff", color: "#6d7175", cursor: "pointer",
                        }}
                      >
                        View Draft Order →
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Status Management Card ── */}
          <div style={card}>
            <div style={cardHeading}>Manage Status</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#6d7175", marginBottom: 6, fontWeight: 500 }}>Current Status</div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 8, fontSize: 14, fontWeight: 700,
                ...(STATUS_STYLE[booking.status] || STATUS_STYLE.pending),
              }}>
                <Icon source={CheckSmallIcon} />
                {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#6d7175", marginBottom: 6, fontWeight: 500 }}>Change To</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatus(s)}
                  disabled={booking.status === s || isSaving}
                  style={{
                    padding: "9px 14px", borderRadius: 7, border: "1px solid",
                    fontSize: 13, fontWeight: 600,
                    cursor: booking.status === s ? "default" : "pointer",
                    textAlign: "left",
                    opacity: booking.status === s ? 0.5 : 1,
                    ...(booking.status === s
                      ? { ...(STATUS_STYLE[s] || {}), borderColor: "transparent" }
                      : { background: "#fff", borderColor: "#c9cccf", color: "#202223" }),
                  }}
                >
                  {booking.status === s ? "✓ " : ""}{s.charAt(0).toUpperCase() + s.slice(1)}
                  {s === "cancelled" && booking.status !== "cancelled" && (
                    <span style={{ fontSize: 11, color: "#8c9196", marginLeft: 6 }}>(sends email)</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Quick Info Card ── */}
          <div style={card}>
            <div style={cardHeading}>Quick Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 4 }}>
              <div style={summaryBlock}>
                <div style={summaryLabel}>Nights</div>
                <div style={summaryValue}>{booking.nights}</div>
              </div>
              <div style={summaryBlock}>
                <div style={summaryLabel}>Quantity</div>
                <div style={summaryValue}>{booking.quantity}</div>
              </div>
              <div style={summaryBlock}>
                <div style={summaryLabel}>Total</div>
                <div style={summaryValue}>{booking.total}</div>
              </div>
              <div style={summaryBlock}>
                <div style={summaryLabel}>Type</div>
                <div style={{ ...summaryValue, textTransform: "capitalize" }}>{booking.bookingType}</div>
              </div>
            </div>
          </div>

          {/* ── View in Shopify ── */}
          {orderAdminUrl && (
            <button
              onClick={() => window.open(orderAdminUrl, "_blank")}
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 8,
                border: "1px solid #c9cccf", background: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#202223",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              View Order in Shopify <Icon source={ExternalSmallIcon} />
            </button>
          )}
        </div>
      </div>
    </s-page>
  );
}

/* ─── Subcomponents ─────────────────────────────────────────────────────────── */

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f2f3" }}>
      <span style={{ fontSize: 13, color: "#6d7175", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#202223", textAlign: "right" }}>{value}</span>
    </div>
  );
}

/* ─── Styles ────────────────────────────────────────────────────────────────── */

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

const backBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  borderRadius: 7,
  border: "1px solid #c9cccf",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  color: "#202223",
};

const actionBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  borderRadius: 7,
  border: "1px solid #c9cccf",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  color: "#202223",
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
  padding: "8px 10px",
  border: "1px solid #c9cccf",
  borderRadius: 6,
  fontSize: 13,
  color: "#202223",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};

const bannerSuccess = {
  marginBottom: 16,
  padding: "10px 16px",
  borderRadius: 8,
  fontSize: 13,
  background: "#d4edda",
  color: "#155724",
  border: "1px solid #c3e6cb",
};

const summaryBlock = {
  background: "#f9fafb",
  borderRadius: 8,
  padding: "10px 12px",
  textAlign: "center",
};

const summaryLabel = {
  fontSize: 11,
  color: "#6d7175",
  fontWeight: 500,
  marginBottom: 2,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const summaryValue = {
  fontSize: 16,
  fontWeight: 700,
  color: "#202223",
};
