import { useState } from "react";
import { useLoaderData, useRouteError } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPlanLimits } from "../plans.server";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toStr(d) {
  return d.toISOString().split("T")[0];
}

function monthLabel(year, month) {
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[month]} ${year}`;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Plan gate - analytics only for Business
  const shopRecord = await prisma.shop.findUnique({ where: { shop } });
  const plan  = shopRecord?.plan ?? "free";
  const limits = getPlanLimits(plan);
  if (!limits.analytics) {
    return redirect("/app/subscribtion");
  }

  const now = new Date();

  // ── 1. Revenue by month - last 12 months ────────────────────────────────
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  const revenueByMonth = await Promise.all(
    months.map(async ({ year, month }) => {
      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 1);
      const agg   = await prisma.booking.aggregate({
        where: {
          shop,
          status: { in: ["confirmed", "completed"] },
          createdAt: { gte: start, lt: end },
        },
        _sum: { totalPrice: true },
      });
      const bookingCount = await prisma.booking.count({
        where: { shop, createdAt: { gte: start, lt: end } },
      });
      return {
        label:    monthLabel(year, month),
        revenue:  agg._sum.totalPrice ?? 0,
        bookings: bookingCount,
      };
    })
  );

  // ── 2. Booking status breakdown (all time) ───────────────────────────────
  const [pending, confirmed, completed, cancelled] = await Promise.all([
    prisma.booking.count({ where: { shop, status: "pending" } }),
    prisma.booking.count({ where: { shop, status: "confirmed" } }),
    prisma.booking.count({ where: { shop, status: "completed" } }),
    prisma.booking.count({ where: { shop, status: "cancelled" } }),
  ]);
  const statusBreakdown = { pending, confirmed, completed, cancelled };

  // ── 3. Top apartments by revenue ────────────────────────────────────────
  const allBookings = await prisma.booking.findMany({
    where:  { shop, status: { in: ["confirmed", "completed"] }, totalPrice: { gt: 0 } },
    select: { apartmentId: true, productTitle: true, totalPrice: true, nights: true },
  });

  const aptMap = {};
  allBookings.forEach((b) => {
    if (!aptMap[b.apartmentId]) {
      aptMap[b.apartmentId] = { name: b.productTitle, revenue: 0, bookings: 0, nights: 0 };
    }
    aptMap[b.apartmentId].revenue   += b.totalPrice ?? 0;
    aptMap[b.apartmentId].bookings  += 1;
    aptMap[b.apartmentId].nights    += b.nights ?? 0;
  });
  const topApartments = Object.values(aptMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // ── 4. Occupancy rate - last 30 days ────────────────────────────────────
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyStr = toStr(thirtyDaysAgo);
  const todayStr  = toStr(now);

  const apartments = await prisma.apartment.findMany({
    where:  { shop, status: "active" },
    select: { id: true, name: true },
  });

  const occupancy = await Promise.all(
    apartments.map(async (apt) => {
      const bookings = await prisma.booking.findMany({
        where: {
          shop,
          apartmentId: apt.id,
          status: { in: ["confirmed", "completed"] },
          startDate: { lte: todayStr },
          endDate:   { gte: thirtyStr },
        },
        select: { startDate: true, endDate: true },
      });
      const bookedDays = new Set();
      bookings.forEach((b) => {
        const s = new Date(b.startDate + "T00:00:00");
        const e = new Date((b.endDate ?? b.startDate) + "T00:00:00");
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          const ds = toStr(d);
          if (ds >= thirtyStr && ds <= todayStr) bookedDays.add(ds);
        }
      });
      return {
        name: apt.name,
        bookedDays: bookedDays.size,
        rate: Math.round((bookedDays.size / 30) * 100),
      };
    })
  );

  // ── 5. Summary KPIs ─────────────────────────────────────────────────────
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [
    totalBookings,
    revenueThisMonthAgg,
    newBookingsThisMonth,
    cancellationsThisMonth,
    avgNightsAgg,
  ] = await Promise.all([
    prisma.booking.count({ where: { shop } }),
    prisma.booking.aggregate({
      where: { shop, status: { in: ["confirmed","completed"] }, createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { totalPrice: true },
    }),
    prisma.booking.count({ where: { shop, createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.booking.count({ where: { shop, status: "cancelled", createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.booking.aggregate({
      where: { shop, status: { in: ["confirmed","completed"] }, nights: { gt: 0 } },
      _avg: { nights: true },
    }),
  ]);

  const totalRevenue = allBookings.reduce((s, b) => s + (b.totalPrice ?? 0), 0);

  return {
    plan,
    kpis: {
      totalBookings,
      totalRevenue,
      revenueThisMonth: revenueThisMonthAgg._sum.totalPrice ?? 0,
      newBookingsThisMonth,
      cancellationsThisMonth,
      avgNights: avgNightsAgg._avg.nights ? Number(avgNightsAgg._avg.nights).toFixed(1) : "0",
    },
    revenueByMonth,
    statusBreakdown,
    topApartments,
    occupancy,
    currency: shopRecord?.currency ?? "USD",
  };
};

// ─── Pure SVG Bar Chart ───────────────────────────────────────────────────────

function BarChart({ data, height = 200, color = "var(--p-color-primary, #FD4A52)", color2 = "#e1e3e5" }) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map((d) => d.revenue), 1);
  const barW   = Math.max(14, Math.floor(560 / data.length) - 8);
  const gap    = Math.floor(560 / data.length) - barW;
  const totalW = data.length * (barW + gap);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={totalW} height={height + 40} style={{ display: "block" }}>
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.revenue / maxVal) * height));
          const x    = i * (barW + gap);
          const y    = height - barH;
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={barW} height={barH}
                fill={d.revenue > 0 ? color : color2}
                rx={4}
                style={{ cursor: "default" }}
              />
              <title>{d.label}: ${Number(d.revenue).toLocaleString("en-US", { minimumFractionDigits: 0 })}</title>
              <text
                x={x + barW / 2} y={height + 16}
                textAnchor="middle" fontSize={10} fill="#6d7175"
              >
                {d.label.split(" ")[0]}
              </text>
              {d.revenue > 0 && (
                <text
                  x={x + barW / 2} y={y - 4}
                  textAnchor="middle" fontSize={9} fill={color} fontWeight="600"
                >
                  ${d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : Math.round(d.revenue)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({ segments, size = 140 }) {
  const total  = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#e1e3e5", margin: "0 auto" }} />
  );

  const r  = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  let   startAngle = -Math.PI / 2;
  const paths = [];

  segments.forEach((seg) => {
    if (!seg.value) return;
    const angle = (seg.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(startAngle + angle);
    const y2 = cy + r * Math.sin(startAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    paths.push(
      <path
        key={seg.label}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={seg.color}
        stroke="#fff"
        strokeWidth={2}
      >
        <title>{seg.label}: {seg.value} ({Math.round((seg.value / total) * 100)}%)</title>
      </path>
    );
    startAngle += angle;
  });

  return (
    <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
      {paths}
      <circle cx={cx} cy={cy} r={r * 0.58} fill="#fff" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={18} fontWeight="700" fill="#202223">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#6d7175">Total</text>
    </svg>
  );
}

// ─── Mini sparkline ──────────────────────────────────────────────────────────

function Sparkline({ data, color = "var(--p-color-primary, #008060)", height = 36, width = 100 }) {
  if (!data.length) return null;
  const maxV = Math.max(...data, 1);
  const pts  = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / maxV) * height;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, sparkData, color = "var(--p-color-primary, #008060)", trend }) {
  return (
    <div style={{
      padding: "16px 18px", border: "1px solid #e1e3e5", borderRadius: 10,
      background: "#fff", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ fontSize: 12, color: "#6d7175", fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#202223", lineHeight: 1 }}>{value}</div>
        {sparkData && <Sparkline data={sparkData} color={color} />}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#6d7175" }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ fontSize: 12, fontWeight: 600, color: trend >= 0 ? "var(--p-color-primary, #008060)" : "#d82c0d" }}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs last month
        </div>
      )}
    </div>
  );
}

// ─── Horizontal Bar (Occupancy) ───────────────────────────────────────────────

function OccupancyBar({ name, rate, bookedDays }) {
  const color = rate >= 80 ? "var(--p-color-primary, #008060)" : rate >= 50 ? "#f59e0b" : "#e1e3e5";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#202223", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 10 }}>{name}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: rate >= 80 ? "var(--p-color-primary, #008060)" : rate >= 50 ? "#856404" : "#6d7175", flexShrink: 0 }}>{rate}%</span>
      </div>
      <div style={{ height: 8, background: "#f1f2f3", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${rate}%`, background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
      <div style={{ fontSize: 11, color: "#8c9196", marginTop: 2 }}>{bookedDays} / 30 days booked</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { kpis, revenueByMonth, statusBreakdown, topApartments, occupancy, currency } = useLoaderData();
  const [activeTab, setActiveTab] = useState("overview");

  const fmtCurrency = (v) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(v);

  const statusSegments = [
    { label: "Confirmed", value: statusBreakdown.confirmed, color: "var(--p-color-primary, #008060)" },
    { label: "Completed", value: statusBreakdown.completed, color: "#6d7175" },
    { label: "Pending",   value: statusBreakdown.pending,   color: "#f59e0b" },
    { label: "Cancelled", value: statusBreakdown.cancelled, color: "#d82c0d" },
  ];

  const totalAllStatus = Object.values(statusBreakdown).reduce((s, v) => s + v, 0);

  const sparkRevenue = revenueByMonth.map((m) => m.revenue);
  const sparkBookings = revenueByMonth.map((m) => m.bookings);

  const TABS = [
    { key: "overview",   label: "Overview"   },
    { key: "revenue",    label: "Revenue"    },
    { key: "bookings",   label: "Bookings"   },
    { key: "occupancy",  label: "Occupancy"  },
    { key: "apartments", label: "Apartments" },
  ];

  return (
    <s-page fullWidth  heading="Analytics">

      {/* ── Tab Bar ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #e1e3e5", paddingBottom: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: activeTab === t.key ? 700 : 400,
              color: activeTab === t.key ? "var(--p-color-primary, #008060)" : "#6d7175",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === t.key ? "1px solid var(--p-color-primary, #008060)" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─────────── OVERVIEW ─────────── */}
      {activeTab === "overview" && (
        <>
          {/* KPI strip */}
          <s-section heading="This Month">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <KPICard
                label="Revenue This Month"
                value={fmtCurrency(kpis.revenueThisMonth)}
                sparkData={sparkRevenue}
                color="var(--p-color-primary, #008060)"
              />
              <KPICard
                label="New Bookings"
                value={kpis.newBookingsThisMonth}
                sparkData={sparkBookings}
                color="#2c6ecb"
              />
              <KPICard
                label="Cancellations"
                value={kpis.cancellationsThisMonth}
                color="#d82c0d"
              />
              <KPICard
                label="Avg. Stay Length"
                value={`${kpis.avgNights} nights`}
                color="#6514d2"
              />
            </div>
          </s-section>

          {/* All-time KPIs */}
          <s-section heading="All Time">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <KPICard label="Total Bookings" value={kpis.totalBookings} color="#202223" />
              <KPICard label="Total Revenue"  value={fmtCurrency(kpis.totalRevenue)} color="var(--p-color-primary, #008060)" />
            </div>
          </s-section>

          {/* Status breakdown + top apartments side-by-side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <s-section heading="Booking Status Breakdown">
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <DonutChart segments={statusSegments} size={150} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
                  {statusSegments.map((s) => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#6d7175" }}>
                        {s.label}: <strong style={{ color: "#202223" }}>{s.value}</strong>
                        {totalAllStatus > 0 && (
                          <span style={{ color: "#8c9196" }}> ({Math.round((s.value / totalAllStatus) * 100)}%)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </s-section>

            <s-section heading="Top Apartments by Revenue">
              {topApartments.length === 0 ? (
                <div style={{ textAlign: "center", color: "#8c9196", fontSize: 13, padding: "24px 0" }}>No revenue data yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {topApartments.map((apt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: i === 0 ? "#f6c90e" : i === 1 ? "#8c9196" : "#cd7f32", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#202223", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{apt.name}</div>
                        <div style={{ fontSize: 11, color: "#6d7175" }}>{apt.bookings} bookings · {apt.nights} nights</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--p-color-primary, #008060)", flexShrink: 0 }}>
                        {fmtCurrency(apt.revenue)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </s-section>
          </div>
        </>
      )}

      {/* ─────────── REVENUE ─────────── */}
      {activeTab === "revenue" && (
        <s-section heading="Monthly Revenue - Last 12 Months">
          {revenueByMonth.every((m) => m.revenue === 0) ? (
            <div style={{ textAlign: "center", color: "#8c9196", padding: "40px 0", fontSize: 14 }}>
              No revenue data yet. Revenue appears when bookings are confirmed.
            </div>
          ) : (
            <>
              <BarChart data={revenueByMonth} height={200} color="var(--p-color-primary, #008060)" />
              <div style={{ marginTop: 20, border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                      {["Month", "Revenue", "Bookings"].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...revenueByMonth].reverse().map((m, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f2f3" }}>
                        <td style={tdStyle}>{m.label}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: m.revenue > 0 ? "var(--p-color-primary, #008060)" : "#8c9196" }}>
                          {m.revenue > 0 ? fmtCurrency(m.revenue) : "-"}
                        </td>
                        <td style={tdStyle}>{m.bookings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </s-section>
      )}

      {/* ─────────── BOOKINGS ─────────── */}
      {activeTab === "bookings" && (
        <>
          <s-section heading="Monthly Bookings - Last 12 Months">
            <BarChart
              data={revenueByMonth.map((m) => ({ ...m, revenue: m.bookings }))}
              height={180}
              color="#2c6ecb"
            />
          </s-section>

          <s-section heading="Status Breakdown">
            <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
              <DonutChart segments={statusSegments} size={180} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {statusSegments.map((s) => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: s.color }} />
                    <span style={{ fontSize: 14, color: "#202223", width: 90 }}>{s.label}</span>
                    <strong style={{ fontSize: 18, color: "#202223", width: 50 }}>{s.value}</strong>
                    <span style={{ fontSize: 12, color: "#8c9196" }}>
                      {totalAllStatus > 0 ? `${Math.round((s.value / totalAllStatus) * 100)}%` : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </s-section>
        </>
      )}

      {/* ─────────── OCCUPANCY ─────────── */}
      {activeTab === "occupancy" && (
        <s-section heading="Occupancy Rate - Last 30 Days">
          <s-paragraph>Percentage of the last 30 days that each apartment had at least one confirmed or completed booking.</s-paragraph>
          <div style={{ marginTop: 16 }}>
            {occupancy.length === 0 ? (
              <div style={{ textAlign: "center", color: "#8c9196", fontSize: 13, padding: "40px 0" }}>
                No active apartments found.
              </div>
            ) : (
              occupancy
                .sort((a, b) => b.rate - a.rate)
                .map((apt, i) => (
                  <OccupancyBar key={i} name={apt.name} rate={apt.rate} bookedDays={apt.bookedDays} />
                ))
            )}
          </div>

          {occupancy.length > 0 && (
            <div style={{ display: "flex", gap: 24, marginTop: 24, padding: "12px 16px", background: "#f6f6f7", borderRadius: 8 }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "var(--p-color-primary, #008060)", marginRight: 6 }} />
                <strong style={{ color: "var(--p-color-primary, #008060)" }}>≥80%</strong> High occupancy
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", marginRight: 6 }} />
                <strong style={{ color: "#856404" }}>50–79%</strong> Medium
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#e1e3e5", marginRight: 6 }} />
                <strong style={{ color: "#6d7175" }}>{"<50%"}</strong> Low
              </div>
            </div>
          )}
        </s-section>
      )}

      {/* ─────────── APARTMENTS ─────────── */}
      {activeTab === "apartments" && (
        <s-section heading="Apartment Performance">
          {topApartments.length === 0 ? (
            <div style={{ textAlign: "center", color: "#8c9196", fontSize: 13, padding: "40px 0" }}>
              No booking data yet.
            </div>
          ) : (
            <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                    {["Rank", "Apartment", "Bookings", "Total Nights", "Revenue", "Avg / Stay"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topApartments.map((apt, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f2f3" }}>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{
                          display: "inline-block", width: 22, height: 22, borderRadius: "50%",
                          background: i === 0 ? "#f6c90e" : i === 1 ? "#8c9196" : i === 2 ? "#cd7f32" : "#e1e3e5",
                          color: "#fff", fontSize: 11, fontWeight: 700,
                          lineHeight: "22px", textAlign: "center",
                        }}>{i + 1}</span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{apt.name}</td>
                      <td style={tdStyle}>{apt.bookings}</td>
                      <td style={tdStyle}>{apt.nights}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "var(--p-color-primary, #008060)" }}>{fmtCurrency(apt.revenue)}</td>
                      <td style={tdStyle}>
                        {apt.bookings > 0 ? fmtCurrency(apt.revenue / apt.bookings) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </s-section>
      )}

    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

// ─── Styles ──────────────────────────────────────────────────────────────────

const thStyle = {
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "#6d7175",
  textAlign: "left",
};

const tdStyle = {
  padding: "12px 14px",
  fontSize: 14,
  color: "#202223",
  verticalAlign: "middle",
};
