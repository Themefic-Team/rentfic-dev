import { useLoaderData, useNavigate, Link } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url   = new URL(request.url);
  const today = new Date();

  // Parse ?month=YYYY-MM from URL, fall back to current month
  const monthParam = url.searchParams.get("month");
  let year, month; // month is 0-indexed internally
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    [year, month] = monthParam.split("-").map(Number);
    month -= 1; // convert to 0-indexed
  } else {
    year  = today.getFullYear();
    month = today.getMonth();
  }

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay    = new Date(year, month + 1, 0).getDate();
  const monthEnd   = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Fetch bookings that overlap this month (start <= monthEnd AND end >= monthStart)
  const rawBookings = await prisma.booking.findMany({
    where: {
      shop,
      startDate: { lte: monthEnd },
      OR: [
        { endDate: { gte: monthStart } },
        { endDate: null, startDate: { gte: monthStart } },
      ],
    },
    select: {
      id: true,
      apartmentId: true,
      productTitle: true,
      startDate: true,
      endDate: true,
      customerName: true,
      status: true,
    },
    orderBy: { startDate: "asc" },
  });

  // Fetch all apartments for the sidebar color legend
  const apartments = await prisma.apartment.findMany({
    where:   { shop },
    select:  { id: true, productTitle: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    bookings:   rawBookings,
    apartments,
    year,
    month,       // 0-indexed
    todayStr: today.toISOString().slice(0, 10),
  };
};

// ─── Color palette ────────────────────────────────────────────────────────────

const PALETTE = [
  { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  { bg: "#fee2e2", border: "#f87171", text: "#991b1b" },
  { bg: "#fef9c3", border: "#facc15", text: "#92400e" },
  { bg: "#ffedd5", border: "#fb923c", text: "#9a3412" },
  { bg: "#e0f2fe", border: "#38bdf8", text: "#0c4a6e" },
  { bg: "#fce7f3", border: "#ec4899", text: "#9d174d" },
];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingCalendar() {
  const { bookings, apartments, year, month, todayStr } = useLoaderData();
  const navigate = useNavigate();

  // Build apartment → color map
  const colorMap = {};
  apartments.forEach((apt, i) => {
    colorMap[apt.id] = PALETTE[i % PALETTE.length];
  });

  // Calendar grid setup
  const firstDay   = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const cells = [];
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDay + 1;
    if (dayNum < 1) {
      cells.push({ dayNum: daysInPrevMonth + dayNum, isCurrentMonth: false, monthOffset: -1 });
    } else if (dayNum > daysInMonth) {
      cells.push({ dayNum: dayNum - daysInMonth, isCurrentMonth: false, monthOffset: 1 });
    } else {
      cells.push({ dayNum, isCurrentMonth: true, monthOffset: 0 });
    }
  }

  const toStr = (y, m, d) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  function getBookingsForDay(cell) {
    const targetDate = new Date(year, month + cell.monthOffset, cell.dayNum);
    const dateStr = toStr(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    
    return bookings.filter((b) => {
      const start = b.startDate ?? "";
      const end   = b.endDate   ?? b.startDate ?? "";
      return start <= dateStr && end >= dateStr;
    });
  }

  // Month navigation
  const prevDate  = new Date(year, month - 1, 1);
  const nextDate  = new Date(year, month + 1, 1);
  const prevParam = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const nextParam = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

  return (
    <s-page fullWidth  heading="Bookings - Calendar View">

      {/* View toggle + New Booking */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", background: "#f6f6f7", border: "1px solid #e1e3e5", borderRadius: 8, padding: 3, gap: 2 }}>
          <Link
            to="/app/booking"
            style={{
              padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500,
              background: "transparent", color: "#6d7175", border: "1px solid transparent",
              display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none",
            }}
          >
            ☰ List
          </Link>
          <span
            style={{
              padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: "#fff", color: "#202223", border: "1px solid #e1e3e5",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            📅 Calendar
          </span>
        </div>

        <Link
          to="/app/booking/new"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 18px", background: "#202223", color: "#fff",
            borderRadius: 8, fontSize: 14, fontWeight: 600,
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          + New Booking
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 20, alignItems: "start" }}>

        {/* ── Calendar ──────────────────────────────────────────────────── */}
        <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 12, overflow: "hidden" }}>

          {/* Month header + prev/next */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px", borderBottom: "1px solid #e1e3e5", background: "#f9fafb",
          }}>
            <Link
              to={`/app/booking/calendar?month=${prevParam}`}
              style={{ padding: "6px 14px", border: "1px solid #e1e3e5", borderRadius: 6, fontSize: 13, color: "#202223", textDecoration: "none", background: "#fff", fontWeight: 500 }}
            >
              ← Prev
            </Link>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#202223" }}>
              {MONTH_NAMES[month]} {year}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Link
                to={`/app/booking/calendar?month=${nextParam}`}
                style={{ padding: "6px 14px", border: "1px solid #e1e3e5", borderRadius: 6, fontSize: 13, color: "#202223", textDecoration: "none", background: "#fff", fontWeight: 500 }}
              >
                Next →
              </Link>
              <Link
                to={`/app/booking/calendar`}
                style={{ padding: "6px 14px", border: "1px solid #e1e3e5", borderRadius: 6, fontSize: 13, color: "#202223", textDecoration: "none", background: "#fff", fontWeight: 500 }}
              >
                Today
              </Link>
            </div>
          </div>

          {/* Day-of-week header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #e1e3e5" }}>
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                style={{ padding: "8px 0", textAlign: "center", fontSize: 12, fontWeight: 600, color: "#6d7175", background: "#f9fafb" }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Grid cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {cells.map((cell, idx) => {
              const targetDate = new Date(year, month + cell.monthOffset, cell.dayNum);
              const dateStr = toStr(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
              const isToday = dateStr === todayStr;
              const dayBookings = getBookingsForDay(cell);
              const isWeekend = idx % 7 === 0 || idx % 7 === 6;

              return (
                <div
                  key={idx}
                  style={{
                    minHeight: 90,
                    borderRight:  (idx + 1) % 7 === 0 ? "none" : "1px solid #f1f2f3",
                    borderBottom: idx < totalCells - 7   ? "1px solid #f1f2f3" : "none",
                    padding: "6px 4px 4px",
                    background: !cell.isCurrentMonth ? "#fafafa" : isWeekend ? "#fcfcfc" : "#fff",
                  }}
                >
                  {/* Day number circle */}
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: isToday ? 700 : 500,
                    color: isToday ? "#fff" : (!cell.isCurrentMonth ? "#a1a1aa" : "#202223"),
                    background: isToday ? "var(--p-color-primary, #FD4A52)" : "transparent",
                    marginBottom: 4,
                  }}>
                    {cell.dayNum}
                  </div>

                  {/* Booking bars */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, opacity: cell.isCurrentMonth ? 1 : 0.6 }}>
                        {dayBookings.slice(0, 3).map((b) => {
                          const color = colorMap[b.apartmentId] ?? PALETTE[0];
                          return (
                            <button
                              key={b.id}
                              onClick={() => navigate(`/app/booking/${b.id}`)}
                              title={`${b.customerName || "Guest"} - ${b.productTitle}`}
                              style={{
                                display: "block", width: "100%", textAlign: "left",
                                padding: "2px 5px", borderRadius: 4,
                                fontSize: 10, fontWeight: 600, lineHeight: 1.4,
                                background: color.bg,
                                border:     `1px solid ${color.border}`,
                                color:      color.text,
                                cursor: "pointer",
                                overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                              }}
                            >
                              {b.customerName || b.productTitle || "Booking"}
                            </button>
                          );
                        })}
                        {dayBookings.length > 3 && (
                          <div style={{ fontSize: 10, color: "#6d7175", paddingLeft: 4 }}>
                            +{dayBookings.length - 3} more
                          </div>
                        )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Apartment legend */}
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#202223", marginBottom: 10 }}>Apartments</div>
            {apartments.length === 0 ? (
              <div style={{ fontSize: 12, color: "#6d7175" }}>No apartments yet.</div>
            ) : (
              apartments.map((apt, i) => {
                const color = PALETTE[i % PALETTE.length];
                return (
                  <div key={apt.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: color.border }} />
                    <span style={{ fontSize: 12, color: "#202223", lineHeight: 1.3 }}>
                      {apt.productTitle || apt.id.slice(-6)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Monthly stats */}
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#202223", marginBottom: 10 }}>This Month</div>
            {[
              { label: "Total Bookings", value: bookings.length },
              { label: "Confirmed",      value: bookings.filter((b) => b.status === "confirmed").length },
              { label: "Pending",        value: bookings.filter((b) => b.status === "pending").length },
              { label: "Cancelled",      value: bookings.filter((b) => b.status === "cancelled").length },
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6d7175", marginBottom: 6 }}>
                <span>{row.label}</span>
                <span style={{ fontWeight: 700, color: "#202223" }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Status color key */}
          <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#202223", marginBottom: 10 }}>Status Key</div>
            {[
              { label: "Confirmed", bg: "#d4edda", color: "#155724" },
              { label: "Pending",   bg: "#fff3cd", color: "#856404" },
              { label: "Cancelled", bg: "#f8d7da", color: "#721c24" },
              { label: "Completed", bg: "#e2e3e5", color: "#383d41" },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ padding: "1px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </s-page>
  );
}
