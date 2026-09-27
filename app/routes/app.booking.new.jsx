import { useState, useEffect } from "react";
import { useLoaderData, useActionData, useNavigation, useNavigate } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendNotification } from "../email.server";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const apartments = await prisma.apartment.findMany({
    where:   { shop, status: "active" },
    select:  { id: true, name: true, productId: true, productTitle: true, pricePerNight: true, settings: true },
    orderBy: { name: "asc" },
  });

  return { apartments };
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd   = await request.formData();

  const apartmentId    = fd.get("apartmentId");
  const customerName   = fd.get("customerName")?.trim() || null;
  const customerEmail  = fd.get("customerEmail")?.trim() || null;
  const startDate      = fd.get("startDate");
  const endDate        = fd.get("endDate") || null;
  const status         = fd.get("status") || "confirmed";
  const totalPrice     = parseFloat(fd.get("totalPrice") || "0") || null;
  const depositAmount  = fd.get("depositAmount") ? parseFloat(fd.get("depositAmount")) : null;
  const notes          = fd.get("notes")?.trim() || null;
  const sendEmail      = fd.get("sendEmail") === "1";

  // Validation
  if (!apartmentId || !startDate) {
    return { success: false, error: "Apartment and Check-in date are required." };
  }

  // Find apartment
  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, shop },
  });
  if (!apartment) {
    return { success: false, error: "Apartment not found." };
  }

  // Calculate nights
  let nights = null;
  if (startDate && endDate && endDate !== startDate) {
    const s = new Date(startDate + "T00:00:00");
    const e = new Date(endDate   + "T00:00:00");
    nights  = Math.round((e - s) / 86_400_000);
    if (nights < 0) nights = 0;
  }

  // Create booking
  const booking = await prisma.booking.create({
    data: {
      shop,
      apartmentId,
      productId:    apartment.productId,
      productTitle: apartment.productTitle || apartment.name,
      customerName,
      customerEmail,
      startDate,
      endDate,
      nights,
      totalPrice,
      depositAmount,
      status,
      lineItemProperties: {
        bookingType:   endDate && endDate !== startDate ? "range" : "single",
        guests:        {},
        quantity:      1,
        manualEntry:   true,
        notes,
      },
    },
  });

  // Optionally send confirmation email to guest
  if (sendEmail && customerEmail) {
    const [firstName, ...rest] = (customerName || "").split(" ");
    const vars = {
      "date":               startDate,
      "start":              startDate,
      "end":                endDate ?? startDate,
      "product.name":       apartment.productTitle || apartment.name,
      "order.name":         "",
      "customer.firstName": firstName || "",
      "customer.lastName":  rest.join(" ") || "",
    };
    await sendNotification(shop, "bookingConfirmation", vars, { to: customerEmail })
      .catch((e) => console.error("[Rentfic] Manual booking email failed:", e));
  }

  return redirect(`/app/booking/${booking.id}`);
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcNights(start, end) {
  if (!start || !end || end <= start) return 0;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end   + "T00:00:00");
  return Math.max(0, Math.round((e - s) / 86_400_000));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewBookingPage() {
  const { apartments }  = useLoaderData();
  const actionData      = useActionData();
  const navigation      = useNavigation();
  const navigate        = useNavigate();
  const isSaving        = navigation.state === "submitting";

  // Form state
  const [apartmentId,   setApartmentId]   = useState(apartments[0]?.id ?? "");
  const [customerName,  setCustomerName]  = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [startDate,     setStartDate]     = useState("");
  const [endDate,       setEndDate]       = useState("");
  const [status,        setStatus]        = useState("confirmed");
  const [totalPrice,    setTotalPrice]    = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [notes,         setNotes]         = useState("");
  const [sendEmail,     setSendEmail]     = useState(true);

  // Auto-fill price from apartment
  const selectedApt = apartments.find((a) => a.id === apartmentId);
  const nights       = calcNights(startDate, endDate);

  useEffect(() => {
    if (selectedApt?.pricePerNight && nights > 0) {
      setTotalPrice((selectedApt.pricePerNight * nights).toFixed(2));
    }
  }, [apartmentId, startDate, endDate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("sendEmail", sendEmail ? "1" : "0");
    // Use native form submission so react-router action gets it
    const form = e.currentTarget;
    form.requestSubmit();
  };

  return (
    <s-page heading="New Manual Booking">
      {/* Back */}
      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => navigate("/app/booking")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#005bd3", padding: 0 }}
        >
          ← Back to Bookings
        </button>
      </div>

      {/* Error banner */}
      {actionData?.error && (
        <div style={{
          padding: "12px 16px", marginBottom: 16,
          background: "#ffd2d2", border: "1px solid #f5c6c6",
          borderRadius: 8, color: "#721c24", fontSize: 14,
        }}>
          ⚠ {actionData.error}
        </div>
      )}

      {apartments.length === 0 && (
        <div style={{
          padding: "24px", background: "#fff8e1", border: "1px solid #ffe082",
          borderRadius: 8, marginBottom: 20, fontSize: 14, color: "#856404",
        }}>
          No active apartments found. <a href="/app/apartments" style={{ color: "#005bd3" }}>Create an apartment first →</a>
        </div>
      )}

      <form method="POST">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

          {/* ── Left column ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Apartment & status */}
            <s-section heading="Booking Details">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                <Field label="Apartment *">
                  <select
                    name="apartmentId"
                    value={apartmentId}
                    onChange={(e) => setApartmentId(e.target.value)}
                    style={inputStyle}
                    required
                  >
                    {apartments.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {selectedApt?.pricePerNight && (
                    <div style={{ fontSize: 12, color: "#6d7175", marginTop: 4 }}>
                      Base rate: ${selectedApt.pricePerNight}/night
                    </div>
                  )}
                </Field>

                <Field label="Status">
                  <select
                    name="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </Field>

                <Field label="Check-in Date *">
                  <input
                    type="date"
                    name="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </Field>

                <Field label="Check-out Date">
                  <input
                    type="date"
                    name="endDate"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>

              {/* Nights pill */}
              {nights > 0 && (
                <div style={{
                  marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 12px", background: "#e6f7f1", borderRadius: 20,
                  fontSize: 13, fontWeight: 600, color: "#008060",
                }}>
                  🌙 {nights} night{nights !== 1 ? "s" : ""}
                </div>
              )}
            </s-section>

            {/* Guest info */}
            <s-section heading="Guest Information">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="Guest Name">
                  <input
                    type="text"
                    name="customerName"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. John Smith"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Guest Email">
                  <input
                    type="email"
                    name="customerEmail"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="e.g. john@example.com"
                    style={inputStyle}
                  />
                </Field>
              </div>
            </s-section>

            {/* Internal notes */}
            <s-section heading="Internal Notes">
              <textarea
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes about this booking (not visible to the guest)…"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </s-section>

          </div>

          {/* ── Right column - pricing + submit ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <s-section heading="Pricing">
              <Field label="Total Price ($)">
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6d7175", fontSize: 14 }}>$</span>
                  <input
                    type="number"
                    name="totalPrice"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(e.target.value)}
                    placeholder="0.00"
                    min={0}
                    step="0.01"
                    style={{ ...inputStyle, paddingLeft: 26 }}
                  />
                </div>
                {selectedApt?.pricePerNight && nights > 0 && (
                  <div style={{ fontSize: 12, color: "#6d7175", marginTop: 4 }}>
                    Suggested: ${(selectedApt.pricePerNight * nights).toFixed(2)} ({nights} nights × ${selectedApt.pricePerNight})
                  </div>
                )}
              </Field>

              <div style={{ marginTop: 14 }}>
                <Field label="Deposit Amount ($)" hint="Leave blank if no deposit required">
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6d7175", fontSize: 14 }}>$</span>
                    <input
                      type="number"
                      name="depositAmount"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      min={0}
                      step="0.01"
                      style={{ ...inputStyle, paddingLeft: 26 }}
                    />
                  </div>
                </Field>
              </div>

              {/* Balance preview */}
              {totalPrice && depositAmount && parseFloat(totalPrice) > 0 && parseFloat(depositAmount) > 0 && (
                <div style={{ marginTop: 14, padding: "10px 14px", background: "#f6f6f7", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: "#6d7175" }}>Deposit</span>
                    <span style={{ fontWeight: 600, color: "#155724" }}>${parseFloat(depositAmount).toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "#6d7175" }}>Balance Due</span>
                    <span style={{ fontWeight: 600, color: "#856404" }}>
                      ${Math.max(0, parseFloat(totalPrice) - parseFloat(depositAmount)).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </s-section>

            {/* Email option */}
            <s-section heading="Email Confirmation">
              <ToggleRow
                label="Send confirmation email"
                hint="Sends the 'Booking Confirmation' email to the guest"
                enabled={sendEmail}
                disabled={!customerEmail}
                onChange={setSendEmail}
              />
              {!customerEmail && (
                <div style={{ fontSize: 12, color: "#8c9196", marginTop: 6 }}>
                  Enter a guest email address above to enable this option.
                </div>
              )}
            </s-section>

            {/* Summary card */}
            <div style={{
              padding: "14px 16px", background: "#f6f6f7",
              border: "1px solid #e1e3e5", borderRadius: 8,
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 600, color: "#202223", marginBottom: 8 }}>Booking Summary</div>
              <SummaryRow label="Apartment" value={selectedApt?.name || "-"} />
              <SummaryRow label="Check-in"  value={startDate || "-"} />
              <SummaryRow label="Check-out" value={endDate   || "-"} />
              <SummaryRow label="Nights"    value={nights > 0 ? `${nights}` : "-"} />
              <SummaryRow label="Total"     value={totalPrice ? `$${parseFloat(totalPrice).toFixed(2)}` : "-"} />
              <SummaryRow label="Status"    value={status.charAt(0).toUpperCase() + status.slice(1)} />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSaving || apartments.length === 0}
              style={{
                padding: "12px 20px", background: isSaving ? "#8c9196" : "#202223",
                color: "#fff", border: "none", borderRadius: 8,
                fontSize: 15, fontWeight: 700, cursor: isSaving ? "default" : "pointer",
                width: "100%", transition: "background 0.15s",
              }}
            >
              {isSaving ? "Creating Booking…" : "✓ Create Booking"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/app/booking")}
              style={{
                padding: "10px 20px", background: "#fff", color: "#202223",
                border: "1px solid #c9cccf", borderRadius: 8,
                fontSize: 14, fontWeight: 500, cursor: "pointer", width: "100%",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </s-page>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, hint, style, children }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#202223", marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 12, color: "#6d7175", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function ToggleRow({ label, hint, enabled, disabled: isDisabled, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: isDisabled ? "#8c9196" : "#202223" }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "#8c9196", marginTop: 2 }}>{hint}</div>}
      </div>
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => !isDisabled && onChange(!enabled)}
        style={{
          width: 42, height: 24, borderRadius: 12, border: "none",
          background: (!isDisabled && enabled) ? "#008060" : "#e1e3e5",
          cursor: isDisabled ? "default" : "pointer",
          position: "relative", flexShrink: 0, transition: "background 0.2s",
        }}
      >
        <span style={{
          position: "absolute", top: 3,
          left: (!isDisabled && enabled) ? 21 : 3,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </button>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #e1e3e5" }}>
      <span style={{ color: "#6d7175" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "#202223" }}>{value}</span>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle = {
  padding: "8px 12px", border: "1px solid #c9cccf", borderRadius: 8,
  fontSize: 14, background: "#fff", width: "100%",
  boxSizing: "border-box", outline: "none",
};
