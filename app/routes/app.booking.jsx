import { useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const bookings = await prisma.booking.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  const formatted = bookings.map((b) => ({
    id:        b.id,
    guest:     b.customerName  || "—",
    email:     b.customerEmail || "",
    apartment: b.productTitle  || "—",
    checkIn:   fmtDate(b.startDate),
    checkOut:  fmtDate(b.endDate),
    nights:    b.nights ?? "—",
    total:     b.totalPrice != null ? fmtCurrency(b.totalPrice) : "—",
    status:    b.status,
    orderId:   b.orderNumber ? `#${b.orderNumber}` : `…${b.id.slice(-6)}`,
    createdAt: b.createdAt,
  }));

  return { bookings: formatted };
};

function fmtDate(str) {
  if (!str) return "—";
  const [y, m, d] = str.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

const ALL_STATUSES = ["all", "pending", "confirmed", "completed", "cancelled"];

export default function BookingPage() {
  const { bookings } = useLoaderData();
  const [search,    setSearch]    = useState("");
  const [statusTab, setStatusTab] = useState("all");

  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch =
      b.guest.toLowerCase().includes(q) ||
      b.apartment.toLowerCase().includes(q) ||
      b.orderId.toLowerCase().includes(q) ||
      b.email.toLowerCase().includes(q);
    const matchStatus = statusTab === "all" || b.status === statusTab;
    return matchSearch && matchStatus;
  });

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = s === "all" ? bookings.length : bookings.filter((b) => b.status === s).length;
    return acc;
  }, {});

  return (
    <s-page heading="Bookings">

      <s-section>
        <s-paragraph>All rental bookings across your apartments.</s-paragraph>

        {/* Filter row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by guest, apartment or order ID…"
            style={{
              padding: "8px 12px",
              border: "1px solid #c9cccf",
              borderRadius: "8px",
              fontSize: "14px",
              width: "300px",
              boxSizing: "border-box",
            }}
          />

          {/* Status tabs */}
          <div style={{ display: "flex", borderBottom: "2px solid #e1e3e5" }}>
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusTab(s)}
                style={{
                  padding: "7px 14px",
                  fontSize: "13px",
                  fontWeight: statusTab === s ? 600 : 400,
                  color: statusTab === s ? "#202223" : "#6d7175",
                  background: "none",
                  border: "none",
                  borderBottom: statusTab === s ? "2px solid #202223" : "2px solid transparent",
                  marginBottom: "-2px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <span style={{ marginLeft: "6px", fontSize: "11px", fontWeight: 600, padding: "1px 6px", borderRadius: "10px", background: "#f1f2f3", color: "#6d7175" }}>
                  {counts[s]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                {["Order", "Guest", "Apartment", "Check-in", "Check-out", "Nights", "Total", "Status"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "48px", textAlign: "center", fontSize: "14px", color: "#6d7175" }}>
                    {bookings.length === 0 ? "No bookings yet." : "No bookings match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #e1e3e5" : "none" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, fontFamily: "monospace", fontSize: "13px" }}>{b.orderId}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{b.guest}</div>
                      {b.email && <div style={{ fontSize: "12px", color: "#6d7175" }}>{b.email}</div>}
                    </td>
                    <td style={{ ...tdStyle, color: "#6d7175" }}>{b.apartment}</td>
                    <td style={tdStyle}>{b.checkIn}</td>
                    <td style={tdStyle}>{b.checkOut}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>{b.nights}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{b.total}</td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: "2px 10px",
                        borderRadius: "10px",
                        ...(STATUS_STYLE[b.status] || STATUS_STYLE.pending),
                      }}>
                        {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: "10px", fontSize: "13px", color: "#6d7175" }}>
          Showing {filtered.length} of {bookings.length} booking{bookings.length !== 1 ? "s" : ""}
        </div>
      </s-section>

      {/* Summary aside */}
      <s-section slot="aside" heading="Summary">
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "Total bookings", value: bookings.length },
            { label: "Pending",        value: counts.pending },
            { label: "Confirmed",      value: counts.confirmed },
            { label: "Completed",      value: counts.completed },
            { label: "Cancelled",      value: counts.cancelled },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", paddingBottom: "10px", borderBottom: "1px solid #f1f2f3" }}>
              <span style={{ color: "#6d7175" }}>{s.label}</span>
              <span style={{ fontWeight: 600, color: "#202223" }}>{s.value}</span>
            </div>
          ))}
        </div>
      </s-section>

    </s-page>
  );
}

const thStyle = {
  padding: "10px 14px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6d7175",
  textAlign: "left",
};

const tdStyle = {
  padding: "12px 14px",
  fontSize: "14px",
  color: "#202223",
  verticalAlign: "middle",
};
