import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError, useLoaderData } from "react-router";
import { PlanCard } from "../components/PlanCard";
import prisma from "../db.server";
import { getPlanLimits } from "../plans.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [
    shopRecord,
    totalBookings,
    activeApartments,
    apartmentCount,
    revenueAgg,
    newBookingsThisMonth,
    cancellationsThisMonth,
    recentBookings,
  ] = await Promise.all([
    prisma.shop.findUnique({ where: { shop } }),
    prisma.booking.count({ where: { shop } }),
    prisma.apartment.count({ where: { shop, status: "active" } }),
    prisma.apartment.count({ where: { shop } }),
    prisma.booking.aggregate({
      where: { shop, status: { in: ["confirmed", "completed"] }, createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { totalPrice: true },
    }),
    prisma.booking.count({ where: { shop, createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.booking.count({ where: { shop, status: "cancelled", createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.booking.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerEmail: true,
        productTitle: true,
        startDate: true,
        endDate: true,
        totalPrice: true,
        nights: true,
        status: true,
      },
    }),
  ]);

  const appPlan = shopRecord?.plan ?? "free";
  const limits  = getPlanLimits(appPlan);
  const apartmentLimit = limits.apartments === Infinity ? null : limits.apartments;

  const revenueThisMonth = revenueAgg._sum.totalPrice ?? 0;

  const avgNights = recentBookings.length
    ? (recentBookings.reduce((sum, b) => sum + (b.nights ?? 0), 0) / recentBookings.length).toFixed(1)
    : "0";

  return {
    appPlan,
    apartmentCount,
    apartmentLimit,
    renewalDate: null,
    stats: {
      totalBookings,
      activeApartments,
      revenueThisMonth,
      newBookingsThisMonth,
      cancellationsThisMonth,
      avgNights,
    },
    recentBookings,
  };
};

const STATUS_STYLE = {
  confirmed: { background: "#d4edda", color: "#155724" },
  completed: { background: "#e2e3e5", color: "#383d41" },
  cancelled: { background: "#f8d7da", color: "#721c24" },
  pending:   { background: "#fff3cd", color: "#856404" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { stats, recentBookings, ...planData } = useLoaderData();

  const overviewStats = [
    { label: "Total Bookings",     value: stats.totalBookings },
    { label: "Active Apartments",  value: stats.activeApartments },
    { label: "Revenue This Month", value: `$${Number(stats.revenueThisMonth).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
    { label: "Avg. Nights / Stay", value: `${stats.avgNights} nights` },
  ];

  return (
    <s-page heading="Dashboard">
      <PlanCard data={planData} />

      {/* Stats */}
      <s-section heading="Overview">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
          {overviewStats.map((s) => (
            <div
              key={s.label}
              style={{
                padding: "16px",
                border: "1px solid #e1e3e5",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#6d7175", marginBottom: "6px" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#202223" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </s-section>

      {/* Recent bookings */}
      <s-section heading="Recent Bookings">
        <s-paragraph>Latest bookings across all apartments.</s-paragraph>
        <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden", marginTop: "12px" }}>
          {recentBookings.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#6d7175", fontSize: "14px" }}>
              No bookings yet.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                  {["Order", "Guest", "Apartment", "Check-in", "Check-out", "Total", "Status"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b, i) => (
                  <tr
                    key={b.id}
                    style={{ borderBottom: i < recentBookings.length - 1 ? "1px solid #e1e3e5" : "none" }}
                  >
                    <td style={tdStyle}>{b.orderNumber ? `#${b.orderNumber}` : <span style={{ color: "#8c9196", fontSize: 12 }}>{b.id.slice(-6).toUpperCase()}</span>}</td>
                    <td style={tdStyle}>{b.customerName ?? b.customerEmail ?? <span style={{ color: "#8c9196" }}>—</span>}</td>
                    <td style={{ ...tdStyle, color: "#6d7175" }}>{b.productTitle}</td>
                    <td style={tdStyle}>{b.startDate}</td>
                    <td style={tdStyle}>{b.endDate ?? "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {b.totalPrice != null ? `$${Number(b.totalPrice).toFixed(2)}` : "—"}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: "2px 10px",
                        borderRadius: "10px",
                        ...(STATUS_STYLE[b.status] ?? STATUS_STYLE.pending),
                      }}>
                        {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </s-section>

    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

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
