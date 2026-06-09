import { useState } from "react";

const BOOKINGS = [
  { id: "#1042", guest: "Sarah Johnson",   email: "sarah.j@email.com",    apartment: "Ocean View Suite",   checkIn: "Jun 12, 2026", checkOut: "Jun 16, 2026", nights: 4, total: "$580",   status: "confirmed" },
  { id: "#1041", guest: "Marco Rossi",     email: "marco.r@email.com",    apartment: "Downtown Loft",      checkIn: "Jun 10, 2026", checkOut: "Jun 14, 2026", nights: 4, total: "$420",   status: "confirmed" },
  { id: "#1040", guest: "Aisha Patel",     email: "aisha.p@email.com",    apartment: "Garden Studio",      checkIn: "Jun 8, 2026",  checkOut: "Jun 11, 2026", nights: 3, total: "$315",   status: "completed" },
  { id: "#1039", guest: "James Carter",    email: "james.c@email.com",    apartment: "Rooftop Penthouse",  checkIn: "Jun 5, 2026",  checkOut: "Jun 10, 2026", nights: 5, total: "$950",   status: "completed" },
  { id: "#1038", guest: "Elena Müller",    email: "elena.m@email.com",    apartment: "Ocean View Suite",   checkIn: "Jun 1, 2026",  checkOut: "Jun 4, 2026",  nights: 3, total: "$435",   status: "cancelled" },
  { id: "#1037", guest: "Tom Harris",      email: "tom.h@email.com",      apartment: "Downtown Loft",      checkIn: "May 28, 2026", checkOut: "Jun 1, 2026",  nights: 4, total: "$420",   status: "completed" },
  { id: "#1036", guest: "Priya Singh",     email: "priya.s@email.com",    apartment: "Garden Studio",      checkIn: "May 22, 2026", checkOut: "May 27, 2026", nights: 5, total: "$525",   status: "completed" },
  { id: "#1035", guest: "Lucas Bernard",   email: "lucas.b@email.com",    apartment: "Rooftop Penthouse",  checkIn: "May 18, 2026", checkOut: "May 21, 2026", nights: 3, total: "$570",   status: "completed" },
  { id: "#1034", guest: "Mei Zhang",       email: "mei.z@email.com",      apartment: "Ocean View Suite",   checkIn: "May 10, 2026", checkOut: "May 17, 2026", nights: 7, total: "$1,015", status: "completed" },
  { id: "#1033", guest: "Daniel Okafor",   email: "daniel.o@email.com",   apartment: "Downtown Loft",      checkIn: "May 5, 2026",  checkOut: "May 8, 2026",  nights: 3, total: "$315",   status: "cancelled" },
  { id: "#1032", guest: "Sofia Hernandez", email: "sofia.h@email.com",    apartment: "Garden Studio",      checkIn: "Apr 28, 2026", checkOut: "May 3, 2026",  nights: 5, total: "$525",   status: "completed" },
  { id: "#1031", guest: "Liam O'Brien",    email: "liam.ob@email.com",    apartment: "Rooftop Penthouse",  checkIn: "Apr 20, 2026", checkOut: "Apr 25, 2026", nights: 5, total: "$950",   status: "completed" },
];

const STATUS_STYLE = {
  confirmed: { background: "#d4edda", color: "#155724" },
  completed: { background: "#e2e3e5", color: "#383d41" },
  cancelled: { background: "#f8d7da", color: "#721c24" },
};

const ALL_STATUSES = ["all", "confirmed", "completed", "cancelled"];

export default function BookingPage() {
  const [search,    setSearch]    = useState("");
  const [statusTab, setStatusTab] = useState("all");

  const filtered = BOOKINGS.filter((b) => {
    const matchSearch =
      b.guest.toLowerCase().includes(search.toLowerCase()) ||
      b.apartment.toLowerCase().includes(search.toLowerCase()) ||
      b.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusTab === "all" || b.status === statusTab;
    return matchSearch && matchStatus;
  });

  const counts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = s === "all" ? BOOKINGS.length : BOOKINGS.filter((b) => b.status === s).length;
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
                <span
                  style={{
                    marginLeft: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: "10px",
                    background: "#f1f2f3",
                    color: "#6d7175",
                  }}
                >
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
                  <td colSpan={8} style={{ padding: "32px", textAlign: "center", fontSize: "14px", color: "#6d7175" }}>
                    No bookings found.
                  </td>
                </tr>
              ) : (
                filtered.map((b, i) => (
                  <tr
                    key={b.id}
                    style={{ borderBottom: i < filtered.length - 1 ? "1px solid #e1e3e5" : "none" }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{b.id}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{b.guest}</div>
                      <div style={{ fontSize: "12px", color: "#6d7175" }}>{b.email}</div>
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
                        ...STATUS_STYLE[b.status],
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

        {/* Row count */}
        <div style={{ marginTop: "10px", fontSize: "13px", color: "#6d7175" }}>
          Showing {filtered.length} of {BOOKINGS.length} bookings
        </div>
      </s-section>

      {/* Summary aside */}
      <s-section slot="aside" heading="Summary">
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "Total bookings",  value: BOOKINGS.length },
            { label: "Confirmed",       value: counts.confirmed },
            { label: "Completed",       value: counts.completed },
            { label: "Cancelled",       value: counts.cancelled },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "14px",
                paddingBottom: "10px",
                borderBottom: "1px solid #f1f2f3",
              }}
            >
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
